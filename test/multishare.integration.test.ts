// Integration test M2 multi screen share (port RND/spike/lk-bun/src/multishare.test.ts) memakai token dari
// endpoint produk + nama dari track.naming.ts. Butuh LiveKit dev di ws://127.0.0.1:7880 (devkey/secret).
import { afterAll, afterEach, expect, test } from "bun:test";
import { SKIP_LIVEKIT_TESTS } from "./livekit.gate";
import {
  AudioStream,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  type Track,
  TrackPublishOptions,
  TrackSource,
  VideoStream,
} from "@livekit/rtc-node";
import type { RoomRole, TokenResponse } from "../src/shared/api.types";
import { CAMERA_TRACK, MIC_TRACK, createScreenNamer, parseTrackName } from "../src/shared/track.naming";
import { createApi } from "../src/server/api";
import { createTestDeps, createTestUser } from "./auth.helpers";
import { centerRgb, type Rgb, rgbClose, startSyntheticAudio, startSyntheticVideo } from "./synthetic-media";

const MIN_FRAMES = 20;
const FRAME_TIMEOUT_MS = 10_000;
const TRACK_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MS = 40_000;
const HTTP_OK = 200;

const deps = createTestDeps();
const { db } = deps;
const app = createApi(deps);

// test-only: user tetap untuk semua skenario (alias → user Better Auth + cookie sesi; identity LiveKit = user.id).
const USERS = ["presenter", "user-a", "user-b", "viewer1"] as const;
type Alias = (typeof USERS)[number];
const ACCOUNTS = Object.fromEntries(
  await Promise.all(USERS.map(async (a) => [a, await createTestUser(deps, { email: `${a}@example.test`, name: a })] as const)),
) as Record<Alias, Awaited<ReturnType<typeof createTestUser>>>;
const idOf = (alias: Alias) => ACCOUNTS[alias].user.id;

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  // Urutan terbalik: stop media dulu baru disconnect room.
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
// Room LiveKit tidak dihapus manual: kosong setelah disconnect, server dev menutupnya via empty timeout.
afterAll(() => db.close());

/** Room SQLite baru (id acak) + keanggotaan; mengembalikan id room. */
function createRoom(members: Partial<Record<Alias, RoomRole>>): string {
  const roomId = `ms-${crypto.randomUUID()}`;
  db.query("INSERT INTO rooms (id, title, created_by, created_at) VALUES (?, ?, ?, ?)").run(
    roomId,
    "multishare",
    idOf("presenter"),
    Date.now(),
  );
  for (const [alias, role] of Object.entries(members)) {
    db.query("INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)").run(roomId, idOf(alias as Alias), role);
  }
  return roomId;
}

/** Token lewat endpoint produk dengan cookie sesi user. */
async function fetchToken(roomId: string, userId: Alias): Promise<TokenResponse> {
  const { cookie } = ACCOUNTS[userId];
  const res = await app.handle(
    new Request(`http://localhost/api/rooms/${roomId}/token`, { method: "POST", headers: { cookie } }),
  );
  expect(res.status).toBe(HTTP_OK);
  return (await res.json()) as TokenResponse;
}

interface Subscribed {
  track: RemoteTrack;
  pub: RemoteTrackPublication;
  identity: string;
}

/** Join dengan token endpoint; listener TrackSubscribed dipasang sebelum connect agar tak ada event terlewat. */
async function joinRoom(roomId: string, userId: Alias) {
  const { token, url } = await fetchToken(roomId, userId);
  const room = new Room();
  const subscribed: Subscribed[] = [];
  room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
    subscribed.push({ track, pub, identity: participant.identity });
  });
  await room.connect(url, token, { autoSubscribe: true, dynacast: false });
  cleanups.push(() => room.disconnect());
  const waitFor = async (count: number): Promise<Subscribed[]> => {
    const deadline = Date.now() + TRACK_TIMEOUT_MS;
    while (subscribed.length < count) {
      if (Date.now() > deadline) {
        throw new Error(`${userId}: hanya ${subscribed.length}/${count} track tersubscribe dalam ${TRACK_TIMEOUT_MS}ms`);
      }
      await Bun.sleep(50);
    }
    return subscribed;
  };
  return { room, waitFor };
}

interface FrameStats {
  frames: number;
  rgb: Rgb;
}

/** Baca frame dari track hingga `n` frame atau timeout; kembalikan jumlah frame + warna terakhir. */
async function readFrames(track: Track, n: number): Promise<FrameStats> {
  const reader = new VideoStream(track).getReader();
  const stats: FrameStats = { frames: 0, rgb: [0, 0, 0] };
  const timeout = Bun.sleep(FRAME_TIMEOUT_MS).then(() => null);
  try {
    while (stats.frames < n) {
      const res = await Promise.race([reader.read(), timeout]);
      if (res === null || res.done) break;
      stats.frames++;
      stats.rgb = centerRgb(res.value.frame);
    }
  } finally {
    await reader.cancel();
  }
  return stats;
}

/** Publish video sintetis; cleanup media didaftarkan otomatis. */
async function publishVideo(room: Room, name: string, color: Rgb, source: TrackSource) {
  const media = startSyntheticVideo(name, color);
  cleanups.push(media.stop);
  await room.localParticipant!.publishTrack(media.track, new TrackPublishOptions({ source, simulcast: true }));
}

test.skipIf(SKIP_LIVEKIT_TESTS)(
  "presenter publish 3 layar + camera + mic, viewer terima 5 track dengan nama/source benar + frame mengalir",
  async () => {
    const roomId = createRoom({ presenter: "participant", viewer1: "viewer" });
    const viewer = await joinRoom(roomId, "viewer1");
    const presenter = await joinRoom(roomId, "presenter");

    const namer = createScreenNamer();
    const videos = [
      { name: namer.next().video, color: [255, 0, 0] as Rgb, source: TrackSource.SOURCE_SCREENSHARE },
      { name: namer.next().video, color: [0, 255, 0] as Rgb, source: TrackSource.SOURCE_SCREENSHARE },
      { name: namer.next().video, color: [0, 0, 255] as Rgb, source: TrackSource.SOURCE_SCREENSHARE },
      { name: CAMERA_TRACK, color: [255, 255, 0] as Rgb, source: TrackSource.SOURCE_CAMERA },
    ];
    for (const v of videos) await publishVideo(presenter.room, v.name, v.color, v.source);
    const mic = startSyntheticAudio(MIC_TRACK);
    cleanups.push(mic.stop);
    await presenter.room.localParticipant!.publishTrack(
      mic.track,
      new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
    );

    const got = await viewer.waitFor(5);
    const byName = new Map(got.map((s) => [s.pub.name!, s]));
    expect([...byName.keys()].sort()).toEqual([CAMERA_TRACK, MIC_TRACK, "screen-1", "screen-2", "screen-3"]);
    expect(got.every((s) => s.identity === idOf("presenter"))).toBe(true);
    expect([...byName.keys()].map((n) => parseTrackName(n)?.kind).sort()).toEqual([
      "camera",
      "mic",
      "screen",
      "screen",
      "screen",
    ]);

    expect(byName.get(MIC_TRACK)!.pub.source).toBe(TrackSource.SOURCE_MICROPHONE);
    const audioReader = new AudioStream(byName.get(MIC_TRACK)!.track).getReader();
    const audio = await audioReader.read();
    await audioReader.cancel();
    expect(audio.done).toBe(false);

    const results = await Promise.all(videos.map((v) => readFrames(byName.get(v.name)!.track, MIN_FRAMES)));
    videos.forEach((v, i) => {
      const r = results[i]!;
      expect(byName.get(v.name)!.pub.source).toBe(v.source);
      expect(r.frames).toBeGreaterThanOrEqual(MIN_FRAMES);
      expect(rgbClose(r.rgb, v.color)).toBe(true);
    });
  },
  TEST_TIMEOUT_MS,
);

test.skipIf(SKIP_LIVEKIT_TESTS)(
  "user-a dan user-b masing-masing share 1 layar, viewer terima keduanya",
  async () => {
    const roomId = createRoom({ "user-a": "participant", "user-b": "participant", viewer1: "viewer" });
    const viewer = await joinRoom(roomId, "viewer1");
    const sharers = [
      { identity: "user-a" as const, color: [255, 0, 255] as Rgb },
      { identity: "user-b" as const, color: [0, 255, 255] as Rgb },
    ];
    for (const s of sharers) {
      const p = await joinRoom(roomId, s.identity);
      // Namer per koneksi: kedua peserta sama-sama mulai dari screen-1.
      await publishVideo(p.room, createScreenNamer().next().video, s.color, TrackSource.SOURCE_SCREENSHARE);
    }

    const got = await viewer.waitFor(2);
    for (const s of sharers) {
      const entry = got.find((g) => g.identity === idOf(s.identity));
      expect(entry).toBeDefined();
      expect(entry!.pub.name).toBe("screen-1");
      expect(entry!.pub.source).toBe(TrackSource.SOURCE_SCREENSHARE);
      const r = await readFrames(entry!.track, MIN_FRAMES);
      expect(r.frames).toBeGreaterThanOrEqual(MIN_FRAMES);
      expect(rgbClose(r.rgb, s.color)).toBe(true);
    }
  },
  TEST_TIMEOUT_MS,
);
