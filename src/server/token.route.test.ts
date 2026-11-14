import { describe, expect, test } from "bun:test";
import { type RoomServiceClient, TokenVerifier } from "livekit-server-sdk";
import type { TokenResponse } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { createSessionCookie } from "./auth.session";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { createRoom } from "./rooms.repository";

const config = loadConfig({ PUBLIC_LIVEKIT_URL: "wss://lk.example.test" }); // test-only
const db = openDb(":memory:");
const synced: string[] = [];
// Fake LiveKit: syncRoomLayout hanya butuh createRoom + updateRoomMetadata; dicatat untuk assert urutan panggilan.
const roomService = {
  createRoom: async ({ name }: { name: string }) => (synced.push(name), { name, metadata: "" }),
  updateRoomMetadata: async () => ({}),
} as unknown as RoomServiceClient;
const app = createApi({ db, config, roomService } satisfies ApiDeps);
const verifier = new TokenVerifier(config.livekitApiKey, config.livekitApiSecret);

function addUser(id: string, isAdmin = false): string {
  db.query("INSERT INTO users (id, name, is_admin, created_at) VALUES (?, ?, ?, ?)").run(id, `Nama ${id}`, isAdmin ? 1 : 0, 0);
  return createSessionCookie(id, config.sessionSecret, 60, false).split(";")[0]!;
}

const ADMIN = addUser("admin", true);
const VIEWER = addUser("vic");
const STRANGER = addUser("stranger");
createRoom(db, { id: "r1", title: "R1", createdBy: "admin" });
createRoom(db, { id: "r2", title: "R2", createdBy: "admin" });
db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'vic', 'viewer')").run();
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

  test("body role:'admin' dari viewer diabaikan → token viewer", async () => {
    const res = await postToken("r1", VIEWER, { role: "admin", identity: "admin" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as TokenResponse;
    expect(json.role).toBe("viewer");
    expect(json.url).toBe("wss://lk.example.test");
    const c = await verifier.verify(json.token);
    expect(c.sub).toBe("vic");
    expect(c.name).toBe("Nama vic");
    expect(c.video?.room).toBe("r1");
    expect(c.video?.canPublish).toBe(false);
    expect(JSON.parse(c.metadata ?? "{}")).toEqual({ role: "viewer" });
    expect(synced).toContain("r1");
  });

  test("admin global bukan member → role admin, tanpa roomAdmin", async () => {
    const res = await postToken("r2", ADMIN);
    expect(res.status).toBe(200);
    const json = (await res.json()) as TokenResponse;
    expect(json.role).toBe("admin");
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
