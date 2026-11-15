import { beforeEach, describe, expect, test } from "bun:test";
import { DataPacket_Kind, type RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { type ApiError, STAGE_EVENT_TOPIC, type SessionUser, type StageEvent, type StageRequest } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { listAudit } from "./audit.repository";
import { createRoom } from "./rooms.repository";
import { STAGE_REQUESTS_MAX } from "./stage.requests.route";

type Actor = { user: SessionUser; cookie: string };
type Sent = { room: string; event: StageEvent; kind: DataPacket_Kind; topic?: string };

let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let admin: Actor;
let host: Actor;
let p: Actor;
let p2: Actor;
let viewer: Actor;
let sent: Sent[];

beforeEach(async () => {
  deps = createTestDeps();
  sent = [];
  // test-only: LiveKit palsu; sendData dicatat (decode payload JSON).
  deps.roomService = {
    async sendData(room: string, data: Uint8Array, kind: DataPacket_Kind, opts: { topic?: string }) {
      sent.push({ room, event: JSON.parse(new TextDecoder().decode(data)) as StageEvent, kind, topic: opts.topic });
    },
    async updateRoomMetadata() {},
  } as unknown as RoomServiceClient;
  app = createApi(deps);
  admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
  host = await createTestUser(deps, { email: "host@example.test" });
  p = await createTestUser(deps, { email: "p@example.test", name: "Pat" });
  p2 = await createTestUser(deps, { email: "p2@example.test" });
  viewer = await createTestUser(deps, { email: "v@example.test" });
  createRoom(deps.db, { id: "r1", title: "R1", createdBy: host.user.id, stageMode: "request" });
  const add = deps.db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, ?)");
  add.run(p.user.id, "participant");
  add.run(p2.user.id, "participant");
  add.run(viewer.user.id, "viewer");
});

const call = (method: string, path: string, who: Actor, body?: unknown) =>
  app.handle(
    new Request(`http://localhost/api/rooms/r1${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: who.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const create = async (who: Actor, body: unknown = { trackName: "screen-1", action: "show" }) => call("POST", "/stage-requests", who, body);
const codeOf = async (res: Response) => ((await res.json()) as ApiError).code;
const pendingIds = async () => ((await (await call("GET", "/stage-requests", host)).json()) as { items: StageRequest[] }).items.map((r) => r.id);

describe("POST /stage-requests", () => {
  test("participant: 200 pending untuk track sendiri + event request.created reliable di topic zoomin.stage", async () => {
    const res = await create(p, { trackName: "screen-2", action: "focus" });
    expect(res.status).toBe(200);
    const req = (await res.json()) as StageRequest;
    expect(req).toMatchObject({ roomId: "r1", userId: p.user.id, userName: "Pat", trackName: "screen-2", action: "focus", status: "pending" });
    expect(sent).toEqual([{ room: "r1", event: { type: "request.created", request: req }, kind: DataPacket_Kind.RELIABLE, topic: STAGE_EVENT_TOPIC }]);
  });

  test("bukan track layar → 400; viewer → 403; mode bukan request → 409 stage_mode_mismatch; room asing 404", async () => {
    for (const trackName of ["camera", "mic", "screen-1-audio", "screen-0"]) {
      const res = await create(p, { trackName, action: "show" });
      expect(res.status).toBe(400);
    }
    expect((await create(p, { trackName: "screen-1", action: "dance" })).status).toBe(400);
    const v = await create(viewer);
    expect(v.status).toBe(403);
    deps.db.run("UPDATE rooms SET stage_mode = 'open' WHERE id = 'r1'");
    const mismatch = await create(p2);
    expect(mismatch.status).toBe(409);
    expect(await codeOf(mismatch)).toBe("stage_mode_mismatch");
    const missing = await app.handle(
      new Request("http://localhost/api/rooms/nope/stage-requests", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: p.cookie },
        body: JSON.stringify({ trackName: "screen-1", action: "show" }),
      }),
    );
    expect(missing.status).toBe(404);
    expect(sent).toEqual([]);
  });

  test("request baru menggantikan yang lama: lama → event resolved canceled, hanya satu pending", async () => {
    const a = (await (await create(p)).json()) as StageRequest;
    const b = (await (await create(p, { trackName: "screen-3", action: "show" })).json()) as StageRequest;
    expect(await pendingIds()).toEqual([b.id]);
    expect(sent.map((s) => [s.event.type, s.event.request.id, s.event.request.status])).toEqual([
      ["request.created", a.id, "pending"],
      ["request.resolved", a.id, "canceled"],
      ["request.created", b.id, "pending"],
    ]);
  });

  test(`rate limit ${STAGE_REQUESTS_MAX}/menit per user per room → 429 + retry-after`, async () => {
    for (let i = 0; i < STAGE_REQUESTS_MAX; i++) expect((await create(p)).status).toBe(200);
    const limited = await create(p);
    expect(limited.status).toBe(429);
    expect(await codeOf(limited)).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await create(p2)).status).toBe(200); // user lain tidak terdampak
  });
});

describe("GET / approve / deny / DELETE", () => {
  test("GET hanya pengelola (host room, admin global); participant 403", async () => {
    const req = (await (await create(p)).json()) as StageRequest;
    expect(await pendingIds()).toEqual([req.id]);
    expect((await call("GET", "/stage-requests", admin)).status).toBe(200);
    expect((await call("GET", "/stage-requests", p)).status).toBe(403);
  });

  test("approve & deny: 204, audit {action,decision}, event resolved; ulang → 404 stage_request_not_found", async () => {
    const a = (await (await create(p)).json()) as StageRequest;
    const b = (await (await create(p2, { trackName: "screen-1", action: "focus" })).json()) as StageRequest;
    expect((await call("POST", `/stage-requests/${a.id}/approve`, p2)).status).toBe(403);
    expect((await call("POST", `/stage-requests/${a.id}/approve`, host)).status).toBe(204);
    expect((await call("POST", `/stage-requests/${b.id}/deny`, admin)).status).toBe(204);
    const again = await call("POST", `/stage-requests/${a.id}/deny`, host);
    expect(again.status).toBe(404);
    expect(await codeOf(again)).toBe("stage_request_not_found");
    expect(await pendingIds()).toEqual([]);
    const resolved = sent.filter((s) => s.event.type === "request.resolved").map((s) => [s.event.request.id, s.event.request.status]);
    expect(resolved).toEqual([
      [a.id, "approved"],
      [b.id, "denied"],
    ]);
    const audit = listAudit(deps.db, { action: "room.stage_request" }).items.map((e) => [e.actorId, e.targetId, e.detail]);
    expect(audit.toSorted()).toEqual(
      [
        [host.user.id, "r1", { action: "show", decision: "approved" }],
        [admin.user.id, "r1", { action: "focus", decision: "denied" }],
      ].toSorted(),
    );
  });

  test("DELETE hanya pemilik: orang lain 404 (request tetap), pemilik 204 + event canceled tanpa audit", async () => {
    const a = (await (await create(p)).json()) as StageRequest;
    expect((await call("DELETE", `/stage-requests/${a.id}`, host)).status).toBe(404);
    expect(await pendingIds()).toEqual([a.id]);
    expect((await call("DELETE", `/stage-requests/${a.id}`, p)).status).toBe(204);
    expect(sent.at(-1)?.event).toEqual({ type: "request.resolved", request: { ...a, status: "canceled" } });
    expect((await call("DELETE", `/stage-requests/${a.id}`, p)).status).toBe(404);
    expect(listAudit(deps.db, { action: "room.stage_request" }).items).toEqual([]);
  });

  test("sendData gagal (room LiveKit belum ada) → request tetap dibuat", async () => {
    deps.roomService.sendData = (async () => {
      throw new Error("room not found");
    }) as RoomServiceClient["sendData"];
    expect((await create(p)).status).toBe(200);
  });
});

describe("mode keluar dari request membatalkan pending", () => {
  const resolvedEvents = () => sent.filter((s) => s.event.type === "request.resolved").map((s) => [s.event.request.id, s.event.request.status]);

  test("PUT stage-mode request→request tidak membatalkan; →open membatalkan semua + event canceled", async () => {
    const a = (await (await create(p)).json()) as StageRequest;
    const b = (await (await create(p2)).json()) as StageRequest;
    expect((await call("PUT", "/stage-mode", host, { mode: "request" })).status).toBe(200);
    expect(await pendingIds()).toEqual([a.id, b.id]);
    expect((await call("PUT", "/stage-mode", host, { mode: "open" })).status).toBe(200);
    expect(await pendingIds()).toEqual([]);
    expect(resolvedEvents()).toEqual([
      [a.id, "canceled"],
      [b.id, "canceled"],
    ]);
  });

  test("PATCH /rooms stageMode host membatalkan pending; PATCH tanpa stageMode tidak", async () => {
    const a = (await (await create(p)).json()) as StageRequest;
    expect((await call("PATCH", "", host, { title: "Renamed" })).status).toBe(200);
    expect(await pendingIds()).toEqual([a.id]);
    expect((await call("PATCH", "", host, { stageMode: "host" })).status).toBe(200);
    expect(await pendingIds()).toEqual([]);
    expect(resolvedEvents()).toEqual([[a.id, "canceled"]]);
  });
});
