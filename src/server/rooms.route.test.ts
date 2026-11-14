import { describe, expect, test } from "bun:test";
import { RoomServiceClient } from "livekit-server-sdk";
import type { Page, RoomSummary } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { createSessionCookie } from "./auth.session";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { createRoom } from "./rooms.repository";

const config = loadConfig({});
const db = openDb(":memory:");
// Tidak dipanggil route rooms; hanya memenuhi tipe.
const deps: ApiDeps = { db, config, roomService: new RoomServiceClient("http://127.0.0.1:1", "k", "s") };
const app = createApi(deps);

function addUser(id: string, isAdmin = false): string {
  db.query("INSERT INTO users (id, name, is_admin, created_at) VALUES (?, ?, ?, ?)").run(id, id, isAdmin ? 1 : 0, 0);
  return createSessionCookie(id, config.sessionSecret, 60, false).split(";")[0]!;
}

const ADMIN = addUser("admin", true);
const ALICE = addUser("alice");

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.handle(
    new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  );
}

describe("GET/POST /api/rooms", () => {
  test("tanpa sesi → 401", async () => {
    expect((await call("GET", "/rooms")).status).toBe(401);
    expect((await call("POST", "/rooms", undefined, { id: "x", title: "X" })).status).toBe(401);
  });

  test("non-admin POST → 403", async () => {
    expect((await call("POST", "/rooms", ALICE, { id: "x", title: "X" })).status).toBe(403);
  });

  test.each([
    { id: "a b", title: "T" },
    { id: "../etc", title: "T" },
    { id: "", title: "T" },
    { id: "ok", title: "" },
    { id: "ok", title: "t".repeat(101) },
    { title: "T" },
  ])("body invalid → 400 (bukan 422): %o", async (body) => {
    const res = await call("POST", "/rooms", ADMIN, body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeString();
  });

  test("admin POST → room + creator jadi admin; duplikat → 409", async () => {
    const res = await call("POST", "/rooms", ADMIN, { id: "dup-room", title: "Dup" });
    expect(res.status).toBe(200);
    const room = (await res.json()) as RoomSummary;
    expect(room).toMatchObject({ id: "dup-room", title: "Dup", role: "admin" });
    expect(db.query("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?").get("dup-room", "admin")).toEqual({
      role: "admin",
    });
    expect((await call("POST", "/rooms", ADMIN, { id: "dup-room", title: "Lagi" })).status).toBe(409);
  });

  test("paginasi 25 room, limit 10 → 3 halaman tanpa duplikat, nextCursor null di akhir", async () => {
    for (let i = 0; i < 25; i++) createRoom(db, { id: `page-${String(i).padStart(2, "0")}`, title: `P${i}`, createdBy: "admin" });
    const total = (db.query("SELECT COUNT(*) AS n FROM rooms").get() as { n: number }).n;
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = `?limit=10${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await call("GET", `/rooms${qs}`, ADMIN);
      expect(res.status).toBe(200);
      const page = (await res.json()) as Page<RoomSummary>;
      expect(page.items.length).toBeLessThanOrEqual(10);
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(Math.ceil(total / 10));
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(total);
  });

  test("limit di luar batas / cursor rusak → 400", async () => {
    expect((await call("GET", "/rooms?limit=0", ADMIN)).status).toBe(400);
    expect((await call("GET", "/rooms?limit=101", ADMIN)).status).toBe(400);
    expect((await call("GET", "/rooms?cursor=bm9wZQ", ADMIN)).status).toBe(400);
  });

  test("user biasa hanya melihat room miliknya; admin global melihat semua dengan role null bila bukan member", async () => {
    createRoom(db, { id: "alice-room", title: "Alice", createdBy: "admin" });
    db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('alice-room', 'alice', 'viewer')").run();
    db.query("DELETE FROM room_members WHERE room_id = 'alice-room' AND user_id = 'admin'").run();

    const mine = (await (await call("GET", "/rooms?limit=100", ALICE)).json()) as Page<RoomSummary>;
    expect(mine.items.map((r) => [r.id, r.role])).toEqual([["alice-room", "viewer"]]);
    expect(mine.nextCursor).toBeNull();

    const all = (await (await call("GET", "/rooms?limit=100", ADMIN)).json()) as Page<RoomSummary>;
    expect(all.items.find((r) => r.id === "alice-room")?.role).toBeNull();
    expect(all.items.find((r) => r.id === "dup-room")?.role).toBe("admin");
  });
});
