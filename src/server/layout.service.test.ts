import { describe, expect, test } from "bun:test";
import { ServerError } from "livekit-server-sdk";
import { type LayoutState, parseLayout } from "../shared/layout.model";
import { openDb } from "./db";
import { getLayout, LayoutConflictError, type LayoutDeps, putLayout, syncRoomLayout } from "./layout.service";

type Call = { method: string; args: unknown[] };

// test-only: RoomServiceClient palsu yang mencatat panggilan; `roomExists` & `metadata` meniru state LiveKit.
function fakeRoomService(opts: { roomExists?: boolean; metadata?: string; failWith?: Error } = {}) {
  const calls: Call[] = [];
  let exists = opts.roomExists ?? true;
  let metadata = opts.metadata ?? "";
  const svc = {
    calls,
    async updateRoomMetadata(room: string, md: string) {
      calls.push({ method: "updateRoomMetadata", args: [room, md] });
      if (opts.failWith) throw opts.failWith;
      if (!exists) throw new ServerError("not_found", "requested room does not exist", 404, "not_found");
      metadata = md;
      return { name: room, metadata };
    },
    async createRoom(o: { name: string; metadata?: string }) {
      calls.push({ method: "createRoom", args: [o] });
      if (!exists) metadata = o.metadata ?? "";
      exists = true;
      return { name: o.name, metadata };
    },
  };
  return svc;
}

function setup(svc = fakeRoomService()) {
  const db = openDb(":memory:");
  db.run("INSERT INTO users (id, name, created_at) VALUES ('u1', 'U1', 1)");
  db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'R1', 'u1', 1)");
  const deps = { db, roomService: svc } as unknown as LayoutDeps;
  return { db, svc, deps };
}

const layout: LayoutState = {
  version: 0,
  template: "grid",
  slots: [{ trackRef: { identity: "alice", trackName: "camera" } }],
  updatedBy: "client",
  updatedAt: 1,
};

describe("layout.service", () => {
  test("getLayout room baru: version 0, layout null", () => {
    const { db } = setup();
    expect(getLayout(db, "r1")).toEqual({ version: 0, layout: null });
  });

  test("CAS: dua tulis baseVersion sama -> satu sukses, satu conflict", async () => {
    const { deps } = setup();
    const results = await Promise.allSettled([
      putLayout(deps, { roomId: "r1", baseVersion: 0, layout, by: "u1" }),
      putLayout(deps, { roomId: "r1", baseVersion: 0, layout: { ...layout, template: "focus" }, by: "u1" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    const err = (fail[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(LayoutConflictError);
    expect((err as LayoutConflictError).currentVersion).toBe(1);
  });

  test("layout_json tersimpan; server mengisi version/updatedBy/updatedAt; metadata dipublish", async () => {
    const { db, deps, svc } = setup();
    const before = Date.now();
    expect(await putLayout(deps, { roomId: "r1", baseVersion: 0, layout, by: "u1" })).toEqual({ version: 1 });
    const saved = getLayout(db, "r1");
    expect(saved.version).toBe(1);
    expect(saved.layout).toMatchObject({ version: 1, template: "grid", updatedBy: "u1" });
    expect(saved.layout!.updatedAt).toBeGreaterThanOrEqual(before);

    expect(svc.calls).toHaveLength(1);
    const [room, md] = svc.calls[0]!.args as [string, string];
    expect(svc.calls[0]!.method).toBe("updateRoomMetadata");
    expect(room).toBe("r1");
    expect(parseLayout(md)).toEqual(saved.layout!);
    expect(parseLayout(md).version).toBe(1);
  });

  test("room LiveKit belum ada -> tulis tetap sukses", async () => {
    const { db, deps } = setup(fakeRoomService({ roomExists: false }));
    expect(await putLayout(deps, { roomId: "r1", baseVersion: 0, layout, by: "u1" })).toEqual({ version: 1 });
    expect(getLayout(db, "r1").version).toBe(1);
  });

  test("error LiveKit lain dipropagasi dengan context", async () => {
    const { deps } = setup(fakeRoomService({ failWith: new Error("boom") }));
    await expect(putLayout(deps, { roomId: "r1", baseVersion: 0, layout, by: "u1" })).rejects.toThrow(/putLayout.*r1/);
  });

  test("room SQLite tidak ada -> error, bukan conflict", async () => {
    const { deps } = setup();
    await expect(putLayout(deps, { roomId: "nope", baseVersion: 0, layout, by: "u1" })).rejects.toThrow(/nope/);
  });

  test("syncRoomLayout tanpa layout: createRoom tanpa metadata, tanpa update", async () => {
    const { deps, svc } = setup(fakeRoomService({ roomExists: false }));
    await syncRoomLayout(deps, "r1");
    expect(svc.calls).toEqual([{ method: "createRoom", args: [{ name: "r1", metadata: undefined }] }]);
  });

  test("syncRoomLayout room belum ada: createRoom membawa metadata, tanpa update", async () => {
    const { deps, svc } = setup(fakeRoomService({ roomExists: false }));
    await putLayout(deps, { roomId: "r1", baseVersion: 0, layout, by: "u1" });
    svc.calls.length = 0;
    await syncRoomLayout(deps, "r1");
    expect(svc.calls.map((c) => c.method)).toEqual(["createRoom"]);
    const md = (svc.calls[0]!.args[0] as { metadata: string }).metadata;
    expect(parseLayout(md).version).toBe(1);
  });

  test("syncRoomLayout room sudah ada dengan metadata lama: updateRoomMetadata dipanggil", async () => {
    const { deps, svc } = setup(fakeRoomService({ roomExists: true, metadata: "stale" }));
    await putLayout(deps, { roomId: "r1", baseVersion: 0, layout, by: "u1" });
    await syncRoomLayout(deps, "r1"); // fake: metadata sudah terkini dari putLayout -> tak perlu update
    expect(svc.calls.map((c) => c.method)).toEqual(["updateRoomMetadata", "createRoom"]);

    const stale = setup(fakeRoomService({ roomExists: true, metadata: "stale" }));
    stale.db.run("UPDATE rooms SET layout_json = ?, layout_version = 1 WHERE id = 'r1'", [JSON.stringify({ ...layout, version: 1 })]);
    await syncRoomLayout(stale.deps, "r1");
    expect(stale.svc.calls.map((c) => c.method)).toEqual(["createRoom", "updateRoomMetadata"]);
  });
});
