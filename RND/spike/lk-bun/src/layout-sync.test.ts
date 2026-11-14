import { afterAll, beforeAll, expect, test } from "bun:test";
import { Room, RoomEvent } from "@livekit/rtc-node";
import { AccessToken, RoomServiceClient, type VideoGrant } from "livekit-server-sdk";
import { livekitConfig } from "./config";
import { type LayoutState, parseLayout, publishLayout, serializeLayout, setFocus, swapSlots } from "./layout";

const { url, apiKey, apiSecret } = livekitConfig;
const httpUrl = url.replace(/^ws/, "http");
const roomName = `layout-sync-${Date.now()}`;
const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
const EVENT_TIMEOUT_MS = 5_000;
const rooms: Room[] = [];

async function token(identity: string, extra: Partial<VideoGrant> = {}) {
  const at = new AccessToken(apiKey, apiSecret, { identity });
  at.addGrant({ room: roomName, roomJoin: true, canPublishData: true, ...extra });
  return at.toJwt();
}

async function join(identity: string): Promise<Room> {
  const room = new Room();
  await room.connect(url, await token(identity), { autoSubscribe: false, dynacast: false });
  rooms.push(room);
  return room;
}

function nextMetadata(room: Room, label: string): Promise<{ metadata: string; at: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: RoomMetadataChanged tidak datang`)), EVENT_TIMEOUT_MS);
    room.once(RoomEvent.RoomMetadataChanged, (metadata) => {
      clearTimeout(timer);
      resolve({ metadata, at: performance.now() });
    });
  });
}

/** Panggil Twirp RoomService langsung dengan JWT klien — jalur yang tersedia bagi pemegang token. */
function twirpUpdateMetadata(jwt: string, metadata: string) {
  return fetch(`${httpUrl}/twirp/livekit.RoomService/UpdateRoomMetadata`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ room: roomName, metadata }),
  });
}

const initial: LayoutState = {
  version: 1,
  template: "grid",
  slots: [
    { trackRef: { identity: "alice", trackName: "camera" } },
    { trackRef: { identity: "bob", trackName: "camera" } },
  ],
  updatedBy: "admin",
  updatedAt: Date.now(),
};
let alice: Room;
let bob: Room;

beforeAll(async () => {
  await svc.createRoom({ name: roomName, emptyTimeout: 60 });
  [alice, bob] = await Promise.all([join("alice"), join("bob")]);
});

afterAll(async () => {
  await Promise.all(rooms.map((r) => r.disconnect()));
  await svc.deleteRoom(roomName);
});

test("publishLayout sampai ke semua klien dengan isi sama + latency", async () => {
  const samples: number[] = [];
  let state = initial;
  for (let i = 0; i < 5; i++) {
    state = i === 0 ? state : swapSlots(state, 0, 1, "admin");
    const waits = [nextMetadata(alice, "alice"), nextMetadata(bob, "bob")];
    const t0 = performance.now();
    await publishLayout(svc, roomName, state);
    const got = await Promise.all(waits);
    for (const g of got) {
      expect(parseLayout(g.metadata)).toEqual(state);
      samples.push(g.at - t0);
    }
  }
  samples.sort((a, b) => a - b);
  console.log(
    `[metadata] n=${samples.length} min=${samples[0]!.toFixed(1)}ms ` +
      `median=${samples[samples.length >> 1]!.toFixed(1)}ms max=${samples.at(-1)!.toFixed(1)}ms`,
  );
  expect(samples.at(-1)!).toBeLessThan(EVENT_TIMEOUT_MS);
});

test("klien yang join belakangan langsung dapat layout terkini dari room.metadata", async () => {
  const latest = setFocus(parseLayout(alice.metadata!), { identity: "bob", trackName: "camera" }, "admin");
  const waits = [nextMetadata(alice, "alice")];
  await publishLayout(svc, roomName, latest);
  await Promise.all(waits);
  const carol = await join("carol");
  expect(parseLayout(carol.metadata!)).toEqual(latest);
});

test("non-admin tidak bisa mengubah room metadata", async () => {
  const before = alice.metadata;
  // rtc-node tidak punya API set room metadata; yang ada hanya metadata participant sendiri.
  expect("setMetadata" in alice).toBe(false);
  // Jalur satu-satunya bagi klien: Twirp RoomService dengan JWT-nya sendiri -> ditolak tanpa roomAdmin.
  const res = await twirpUpdateMetadata(await token("mallory"), "hacked");
  console.log(`[twirp non-admin] status=${res.status} body=${(await res.text()).slice(0, 80)}`);
  expect(res.ok).toBe(false);
  expect([401, 403]).toContain(res.status);
  expect((await svc.listRooms([roomName]))[0]!.metadata).toBe(before!);
});

test("token ber-roomAdmin BISA mengubah metadata via Twirp -> jangan beri ke browser", async () => {
  const next = serializeLayout({ ...parseLayout(alice.metadata!), version: 999, updatedBy: "room-admin-token" });
  const wait = nextMetadata(bob, "bob");
  const res = await twirpUpdateMetadata(await token("admin-ui", { roomAdmin: true }), next);
  console.log(`[twirp roomAdmin] status=${res.status}`);
  expect(res.status).toBe(200);
  expect((await wait).metadata).toBe(next);
});

test("pembanding: publishData (reliable) latency antar klien", async () => {
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const payload = new TextEncoder().encode(serializeLayout({ ...initial, version: 100 + i }));
    const got = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("bob: dataReceived tidak datang")), EVENT_TIMEOUT_MS);
      bob.once(RoomEvent.DataReceived, (data, _p, _k, topic) => {
        clearTimeout(timer);
        expect(topic).toBe("layout");
        expect(parseLayout(new TextDecoder().decode(data)).version).toBe(100 + i);
        resolve(performance.now());
      });
    });
    const t0 = performance.now();
    await alice.localParticipant!.publishData(payload, { reliable: true, topic: "layout" });
    samples.push((await got) - t0);
  }
  samples.sort((a, b) => a - b);
  console.log(`[publishData] n=5 min=${samples[0]!.toFixed(1)}ms median=${samples[2]!.toFixed(1)}ms max=${samples[4]!.toFixed(1)}ms`);
});
