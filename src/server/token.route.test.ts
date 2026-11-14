import { describe, expect, test } from "bun:test";
import { type RoomServiceClient, TokenVerifier } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { SAFE_ID_PATTERN, type TokenResponse } from "../shared/api.types";
import { createApi } from "./api";
import { createRoom } from "./rooms.repository";

const deps = createTestDeps({ PUBLIC_LIVEKIT_URL: "wss://lk.example.test" }); // test-only
const { db, config } = deps;
const synced: string[] = [];
// Fake LiveKit: syncRoomLayout hanya butuh createRoom + updateRoomMetadata; dicatat untuk assert urutan panggilan.
const roomService = {
  createRoom: async ({ name }: { name: string }) => (synced.push(name), { name, metadata: "" }),
  updateRoomMetadata: async () => ({}),
} as unknown as RoomServiceClient;
const app = createApi({ ...deps, roomService });
const verifier = new TokenVerifier(config.livekitApiKey, config.livekitApiSecret);

const admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
const vic = await createTestUser(deps, { email: "vic@example.test", name: "Nama vic" });
const ADMIN = admin.cookie;
const VIEWER = vic.cookie;
const STRANGER = (await createTestUser(deps, { email: "stranger@example.test" })).cookie;
createRoom(db, { id: "r1", title: "R1", createdBy: admin.user.id });
createRoom(db, { id: "r2", title: "R2", createdBy: admin.user.id });
db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, 'viewer')").run(vic.user.id);
db.query("DELETE FROM room_members WHERE room_id = 'r2'").run(); // admin global bukan member r2

function postToken(roomId: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.handle(
    new Request(`http://localhost/api/rooms/${roomId}/token`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe("POST /api/rooms/:roomId/token", () => {
  test("tanpa sesi → 401", async () => {
    expect((await postToken("r1")).status).toBe(401);
  });

  test("bukan member → 403", async () => {
    expect((await postToken("r1", STRANGER)).status).toBe(403);
  });

  test("room tidak ada → 404", async () => {
    expect((await postToken("ghost", VIEWER)).status).toBe(404);
  });

  test("roomId invalid → 400 (bukan 422)", async () => {
    expect((await postToken("a%20b", VIEWER)).status).toBe(400);
  });

  test("body role:'host' dari viewer diabaikan → token viewer; identity = id user Better Auth", async () => {
    const res = await postToken("r1", VIEWER, { role: "host", identity: "admin" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as TokenResponse;
    expect(json.role).toBe("viewer");
    expect(json.url).toBe("wss://lk.example.test");
    const c = await verifier.verify(json.token);
    expect(c.sub).toBe(vic.user.id);
    expect(c.sub).toMatch(new RegExp(SAFE_ID_PATTERN));
    expect(c.name).toBe("Nama vic");
    expect(c.video?.room).toBe("r1");
    expect(c.video?.canPublish).toBe(false);
    expect(JSON.parse(c.metadata ?? "{}")).toEqual({ role: "viewer" });
    expect(synced).toContain("r1");
  });

  test("admin global bukan member → role host, tanpa roomAdmin", async () => {
    const res = await postToken("r2", ADMIN);
    expect(res.status).toBe(200);
    const json = (await res.json()) as TokenResponse;
    expect(json.role).toBe("host");
    const c = await verifier.verify(json.token);
    expect(c.video?.canPublish).toBe(true);
    expect(c.video?.roomAdmin).toBeUndefined();
  });

  test("ditolak (401/403/404) tidak menyentuh LiveKit", async () => {
    synced.length = 0;
    await Promise.all([postToken("r1"), postToken("r1", STRANGER), postToken("ghost", VIEWER)]);
    expect(synced).toEqual([]);
  });
});
