// Integrasi layout dengan LiveKit dev nyata (ws://127.0.0.1:7880, devkey/secret). Port dari spike layout-sync.test.ts.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { SKIP_LIVEKIT_TESTS } from "./livekit.gate";
import { Room, RoomEvent } from "@livekit/rtc-node";
import type { LayoutState } from "../src/shared/layout.model";
import { type RoomRole, STAGE_EVENT_TOPIC, type StageEvent } from "../src/shared/api.types";
import { parseRoomStage } from "../src/shared/stage.model";
import { notifyStage } from "../src/server/stage.notify";
import { createApi } from "../src/server/api";
import { syncRoomLayout } from "../src/server/layout.service";
import { createJoinToken } from "../src/server/token.service";
import { createTestDeps, createTestUser } from "./auth.helpers";

const deps = createTestDeps(); // test-only: dev default LiveKit lokal
const { config, db, roomService } = deps;
const httpUrl = config.livekitUrl.replace(/^ws/, "http");
const roomId = `lsync-${crypto.randomUUID().slice(0, 8)}`;
const EVENT_TIMEOUT_MS = 5_000;
const app = createApi(deps);
// Host room (peran room, bukan admin global); identity LiveKit = id user Better Auth.
const host = await createTestUser(deps, { email: "ra@example.test", name: "RoomAdmin" });
const rooms: Room[] = [];

const token = (identity: string, role: RoomRole) => createJoinToken({ room: roomId, identity, role }, config);

async function join(identity: string, role: RoomRole): Promise<Room> {
  const room = new Room();
  await room.connect(config.livekitUrl, await token(identity, role), { autoSubscribe: false, dynacast: false });
  rooms.push(room);
  return room;
}

function nextMetadata(room: Room, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: RoomMetadataChanged tidak datang`)), EVENT_TIMEOUT_MS);
    room.once(RoomEvent.RoomMetadataChanged, (metadata) => {
      clearTimeout(timer);
      resolve(metadata);
    });
  });
}

function putLayout(baseVersion: number, layout: LayoutState) {
  return app.handle(
    new Request(`http://localhost/api/rooms/${roomId}/layout`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: host.cookie,
      },
      body: JSON.stringify({ baseVersion, layout }),
    }),
  );
}

/** Twirp RoomService langsung dengan JWT klien: satu-satunya jalur pemegang token menulis room metadata. */
function twirpUpdateMetadata(jwt: string, metadata: string) {
  return fetch(`${httpUrl}/twirp/livekit.RoomService/UpdateRoomMetadata`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ room: roomId, metadata }),
  });
}

const layout: LayoutState = {
  version: 0,
  template: "grid",
  slots: [
    { trackRef: { identity: "alice", trackName: "camera" } },
    { trackRef: { identity: "bob", trackName: "camera" } },
  ],
  updatedBy: host.user.id,
  updatedAt: 1,
};
let alice: Room;
let bob: Room;

beforeAll(async () => {
  if (SKIP_LIVEKIT_TESTS) return;
  db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES (?, 'Sync', ?, 1)", [roomId, host.user.id]);
  db.run("INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, 'host')", [roomId, host.user.id]);
  await syncRoomLayout({ db, roomService }, roomId); // seperti saat token pertama diterbitkan
  [alice, bob] = await Promise.all([join("alice", "participant"), join("bob", "viewer")]);
});

afterAll(async () => {
  if (SKIP_LIVEKIT_TESTS) return;
  await Promise.all(rooms.map((r) => r.disconnect()));
  await roomService.deleteRoom(roomId);
});

test.skipIf(SKIP_LIVEKIT_TESTS)("PUT host sampai ke semua klien dengan isi sama", async () => {
  const waits = [nextMetadata(alice, "alice"), nextMetadata(bob, "bob")];
  const res = await putLayout(0, layout);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ version: 1 });
  const [a, b] = await Promise.all(waits);
  expect(a).toBe(b!);
  expect(parseRoomStage(a!).layout).toMatchObject({ version: 1, template: "grid", updatedBy: host.user.id });
});

test.skipIf(SKIP_LIVEKIT_TESTS)("late joiner langsung dapat layout terkini dari room.metadata", async () => {
  const wait = nextMetadata(alice, "alice");
  expect((await putLayout(1, { ...layout, template: "focus" })).status).toBe(200);
  const latest = await wait;
  const carol = await join("carol", "viewer");
  expect(carol.metadata).toBe(latest);
  expect(parseRoomStage(carol.metadata!).layout?.version).toBe(2);
});

test.skipIf(SKIP_LIVEKIT_TESTS)("room LiveKit dibuat ulang: syncRoomLayout memulihkan metadata dari SQLite", async () => {
  const other = `${roomId}-re`;
  db.run("INSERT INTO rooms (id, title, created_by, layout_json, layout_version, created_at) VALUES (?, 'Re', ?, ?, 3, 1)", [
    other,
    host.user.id,
    JSON.stringify({ ...layout, version: 3 }),
  ]);
  await syncRoomLayout({ db, roomService }, other);
  const listed = (await roomService.listRooms([other]))[0];
  await roomService.deleteRoom(other);
  expect(parseRoomStage(listed!.metadata)).toMatchObject({ stageMode: "host", layout: { version: 3 } });
});

test.skipIf(SKIP_LIVEKIT_TESTS)("token participant dan host (tanpa roomAdmin) -> Twirp UpdateRoomMetadata 401", async () => {
  const before = (await roomService.listRooms([roomId]))[0]!.metadata;
  for (const role of ["participant", "host"] as const) {
    const res = await twirpUpdateMetadata(await token(`mallory-${role}`, role), "hacked");
    expect(res.status).toBe(401);
  }
  expect((await roomService.listRooms([roomId]))[0]!.metadata).toBe(before);
});

test.skipIf(SKIP_LIVEKIT_TESTS)("notifyStage: StageEvent sampai ke klien di topic zoomin.stage (sendData reliable)", async () => {
  const event: StageEvent = {
    type: "request.created",
    request: { id: "q1", roomId, userId: "alice", userName: "Alice", trackName: "screen-1", action: "show", status: "pending", createdAt: 1, expiresAt: 2 },
  };
  const got = new Promise<{ payload: string; topic?: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("bob: DataReceived tidak datang")), EVENT_TIMEOUT_MS);
    bob.once(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      clearTimeout(timer);
      resolve({ payload: new TextDecoder().decode(payload), topic });
    });
  });
  await notifyStage({ roomService }, event);
  const { payload, topic } = await got;
  expect(topic).toBe(STAGE_EVENT_TOPIC);
  expect(JSON.parse(payload)).toEqual(event);
});
