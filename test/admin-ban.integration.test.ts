import { afterAll, describe, expect, test } from "bun:test";
import { SKIP_LIVEKIT_TESTS } from "./livekit.gate";
import { Room, RoomEvent } from "@livekit/rtc-node";
import type { TokenResponse } from "../src/shared/api.types";
import { createApi } from "../src/server/api";
import { createRoom } from "../src/server/rooms.repository";
import { createTestDeps, createTestUser } from "./auth.helpers";

// Butuh LiveKit dev nyata (`livekit-server --dev`, ws://127.0.0.1:7880, devkey/secret).
const DISCONNECT_TIMEOUT_MS = 10_000;

const deps = createTestDeps();
const app = createApi(deps);
const roomId = `ban-${crypto.randomUUID().slice(0, 8)}`;
const room = new Room();

afterAll(async () => {
  if (SKIP_LIVEKIT_TESTS) return;
  await room.disconnect();
  await deps.roomService.deleteRoom(roomId).catch((cause: unknown) => console.warn(`cleanup deleteRoom ${roomId}`, cause));
});

describe.skipIf(SKIP_LIVEKIT_TESTS)("ban admin → keluar dari LiveKit (A6)", () => {
  test(
    "participant terhubung, admin ban → participant terputus & hilang dari room",
    async () => {
      const admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
      const ana = await createTestUser(deps, { email: "ana@example.test", name: "Ana" });
      createRoom(deps.db, { id: roomId, title: "Ban IT", createdBy: admin.user.id });
      deps.db.query("INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, 'participant')").run(roomId, ana.user.id);

      const tokenRes = await app.handle(new Request(`http://localhost/api/rooms/${roomId}/token`, { method: "POST", headers: { cookie: ana.cookie } }));
      expect(tokenRes.status).toBe(200);
      const { url, token } = (await tokenRes.json()) as TokenResponse;
      await room.connect(url, token);
      expect((await deps.roomService.listParticipants(roomId)).map((p) => p.identity)).toContain(ana.user.id);

      const disconnected = new Promise<void>((resolve) => room.once(RoomEvent.Disconnected, () => resolve()));
      const res = await app.handle(
        new Request(`http://localhost/api/admin/users/${ana.user.id}/ban`, {
          method: "POST",
          headers: { cookie: admin.cookie, "content-type": "application/json" },
          body: JSON.stringify({ reason: "uji integrasi" }),
        }),
      );
      expect(res.status).toBe(200);
      await disconnected;
      expect((await deps.roomService.listParticipants(roomId)).map((p) => p.identity)).not.toContain(ana.user.id);
    },
    DISCONNECT_TIMEOUT_MS * 2,
  );
});
