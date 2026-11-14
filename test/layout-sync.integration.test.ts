// Integrasi layout dengan LiveKit dev nyata (ws://127.0.0.1:7880, devkey/secret). Port dari spike layout-sync.test.ts.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Room, RoomEvent } from "@livekit/rtc-node";
import { RoomServiceClient } from "livekit-server-sdk";
import type { Role } from "../src/shared/api.types";
import { type LayoutState, parseLayout } from "../src/shared/layout.model";
import { createApi } from "../src/server/api";
import { createSessionCookie } from "../src/server/auth.session";
import { loadConfig } from "../src/server/config";
import { openDb } from "../src/server/db";
import { syncRoomLayout } from "../src/server/layout.service";
import { createJoinToken } from "../src/server/token.service";

const config = loadConfig({}); // test-only: dev default LiveKit lokal
const httpUrl = config.livekitUrl.replace(/^ws/, "http");
const roomService = new RoomServiceClient(httpUrl, config.livekitApiKey, config.livekitApiSecret);
const roomId = `lsync-${crypto.randomUUID().slice(0, 8)}`;
const EVENT_TIMEOUT_MS = 5_000;
const db = openDb(":memory:");
const app = createApi({ db, config, roomService });
const rooms: Room[] = [];

const token = (identity: string, role: Role) => createJoinToken({ room: roomId, identity, role }, config);

async function join(identity: string, role: Role): Promise<Room> {
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
        cookie: createSessionCookie("ra", config.sessionSecret, 3600, false).split(";")[0]!,
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
  updatedBy: "ra",
  updatedAt: 1,
};
let alice: Room;
let bob: Room;

beforeAll(async () => {
  db.run("INSERT INTO users (id, name, created_at) VALUES ('ra', 'RoomAdmin', 1)");
  db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES (?, 'Sync', 'ra', 1)", [roomId]);
  db.run("INSERT INTO room_members (room_id, user_id, role) VALUES (?, 'ra', 'admin')", [roomId]);
  await syncRoomLayout({ db, roomService }, roomId); // seperti saat token pertama diterbitkan
  [alice, bob] = await Promise.all([join("alice", "participant"), join("bob", "viewer")]);
});

afterAll(async () => {
  await Promise.all(rooms.map((r) => r.disconnect()));
  await roomService.deleteRoom(roomId);
});

test("PUT admin sampai ke semua klien dengan isi sama", async () => {
  const waits = [nextMetadata(alice, "alice"), nextMetadata(bob, "bob")];
  const res = await putLayout(0, layout);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ version: 1 });
  const [a, b] = await Promise.all(waits);
  expect(a).toBe(b!);
  expect(parseLayout(a!)).toMatchObject({ version: 1, template: "grid", updatedBy: "ra" });
});

test("late joiner langsung dapat layout terkini dari room.metadata", async () => {
  const wait = nextMetadata(alice, "alice");
  expect((await putLayout(1, { ...layout, template: "focus" })).status).toBe(200);
  const latest = await wait;
  const carol = await join("carol", "viewer");
  expect(carol.metadata).toBe(latest);
  expect(parseLayout(carol.metadata!).version).toBe(2);
});

test("room LiveKit dibuat ulang: syncRoomLayout memulihkan metadata dari SQLite", async () => {
  const other = `${roomId}-re`;
  db.run("INSERT INTO rooms (id, title, created_by, layout_json, layout_version, created_at) VALUES (?, 'Re', 'ra', ?, 3, 1)", [
    other,
    JSON.stringify({ ...layout, version: 3 }),
  ]);
  await syncRoomLayout({ db, roomService }, other);
  const listed = (await roomService.listRooms([other]))[0];
  await roomService.deleteRoom(other);
  expect(parseLayout(listed!.metadata).version).toBe(3);
});

test("token participant dan admin (tanpa roomAdmin) -> Twirp UpdateRoomMetadata 401", async () => {
  const before = (await roomService.listRooms([roomId]))[0]!.metadata;
  for (const role of ["participant", "admin"] as const) {
    const res = await twirpUpdateMetadata(await token(`mallory-${role}`, role), "hacked");
    expect(res.status).toBe(401);
  }
  expect((await roomService.listRooms([roomId]))[0]!.metadata).toBe(before);
});
