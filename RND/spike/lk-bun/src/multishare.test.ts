import { afterEach, expect, test } from "bun:test";
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
import { AccessToken } from "livekit-server-sdk";
import { livekitConfig } from "./config";
import { centerRgb, type Rgb, rgbClose, startSyntheticAudio, startSyntheticVideo } from "./synthetic-media";

// Spike: banyak screen share bersamaan (termasuk >1 layar dari satu peserta).
const MIN_FRAMES = 20;
const FRAME_TIMEOUT_MS = 10_000;
const TRACK_TIMEOUT_MS = 10_000;

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  // Urutan terbalik: stop media dulu baru disconnect room.
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

async function makeToken(roomName: string, identity: string): Promise<string> {
  const at = new AccessToken(livekitConfig.apiKey, livekitConfig.apiSecret, { identity });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

interface Subscribed {
  track: RemoteTrack;
  pub: RemoteTrackPublication;
  identity: string;
}

/** Room dengan listener TrackSubscribed terpasang sebelum connect agar tak ada event terlewat. */
async function joinRoom(roomName: string, identity: string) {
  const room = new Room();
  const subscribed: Subscribed[] = [];
  room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
    subscribed.push({ track, pub, identity: participant.identity });
  });
  await room.connect(livekitConfig.url, await makeToken(roomName, identity), { autoSubscribe: true, dynacast: false });
  cleanups.push(() => room.disconnect());
  const waitFor = async (count: number): Promise<Subscribed[]> => {
    const deadline = Date.now() + TRACK_TIMEOUT_MS;
    while (subscribed.length < count) {
      if (Date.now() > deadline) {
        throw new Error(`${identity}: hanya ${subscribed.length}/${count} track tersubscribe dalam ${TRACK_TIMEOUT_MS}ms`);
      }
      await Bun.sleep(50);
    }
    return subscribed;
  };
  return { room, waitFor };
}

interface FrameStats {
  frames: number;
  width: number;
  height: number;
  rgb: Rgb;
  firstFrameMs: number;
}

/** Baca frame dari track hingga `n` frame atau timeout; kembalikan statistik. */
async function readFrames(track: Track, n: number): Promise<FrameStats> {
  const reader = new VideoStream(track).getReader();
  const start = Date.now();
  const stats: FrameStats = { frames: 0, width: 0, height: 0, rgb: [0, 0, 0], firstFrameMs: -1 };
  const timeout = Bun.sleep(FRAME_TIMEOUT_MS).then(() => null);
  try {
    while (stats.frames < n) {
      const res = await Promise.race([reader.read(), timeout]);
      if (res === null || res.done) break;
      if (stats.frames === 0) stats.firstFrameMs = Date.now() - start;
      stats.frames++;
      stats.width = res.value.frame.width;
      stats.height = res.value.frame.height;
      stats.rgb = centerRgb(res.value.frame);
    }
  } finally {
    await reader.cancel();
  }
  return stats;
}

function opts(source: TrackSource, simulcast: boolean): TrackPublishOptions {
  return new TrackPublishOptions({ source, simulcast });
}

const randomRoom = () => `multishare-${crypto.randomUUID()}`;

test(
  "1 peserta publish 3 SCREEN_SHARE + CAMERA + MICROPHONE, subscriber terima semua + frame mengalir",
  async () => {
    const roomName = randomRoom();
    const sub = await joinRoom(roomName, "viewer");
    const pub = await joinRoom(roomName, "presenter");

    const videos = [
      { name: "screen-1", color: [255, 0, 0] as Rgb, source: TrackSource.SOURCE_SCREENSHARE, simulcast: true },
      { name: "screen-2", color: [0, 255, 0] as Rgb, source: TrackSource.SOURCE_SCREENSHARE, simulcast: false },
      { name: "screen-3", color: [0, 0, 255] as Rgb, source: TrackSource.SOURCE_SCREENSHARE, simulcast: true },
      { name: "camera", color: [255, 255, 0] as Rgb, source: TrackSource.SOURCE_CAMERA, simulcast: true },
    ];
    for (const v of videos) {
      const media = startSyntheticVideo(v.name, v.color);
      cleanups.push(media.stop);
      await pub.room.localParticipant!.publishTrack(media.track, opts(v.source, v.simulcast));
    }
    const mic = startSyntheticAudio("mic");
    cleanups.push(mic.stop);
    await pub.room.localParticipant!.publishTrack(mic.track, opts(TrackSource.SOURCE_MICROPHONE, false));

    const got = await sub.waitFor(5);
    const byName = new Map(got.map((s) => [s.pub.name, s]));
    expect([...byName.keys()].sort()).toEqual(["camera", "mic", "screen-1", "screen-2", "screen-3"]);
    expect(byName.get("mic")!.pub.source).toBe(TrackSource.SOURCE_MICROPHONE);
    const audioReader = new AudioStream(byName.get("mic")!.track).getReader();
    const audio = await audioReader.read();
    await audioReader.cancel();
    console.log(`[1-peserta] mic audio frame: done=${audio.done} samples=${audio.value?.samplesPerChannel}`);
    expect(audio.done).toBe(false);
    expect(got.every((s) => s.identity === "presenter")).toBe(true);

    const results = await Promise.all(videos.map((v) => readFrames(byName.get(v.name)!.track, MIN_FRAMES)));
    videos.forEach((v, i) => {
      const s = byName.get(v.name)!;
      const r = results[i]!;
      console.log(
        `[1-peserta] ${v.name} source=${TrackSource[s.pub.source!]} simulcasted=${s.pub.simulcasted}` +
          ` pubDim=${s.pub.width}x${s.pub.height} frames=${r.frames} recv=${r.width}x${r.height}` +
          ` rgb=${r.rgb.join(",")} firstFrame=${r.firstFrameMs}ms`,
      );
      expect(s.pub.source).toBe(v.source);
      expect(r.frames).toBeGreaterThanOrEqual(MIN_FRAMES);
      expect(rgbClose(r.rgb, v.color)).toBe(true);
    });
  },
  40_000,
);

test(
  "2 peserta (A & B) masing-masing share 1 layar, peserta ketiga terima keduanya",
  async () => {
    const roomName = randomRoom();
    const viewer = await joinRoom(roomName, "viewer-c");
    const sharers = [
      { identity: "user-a", name: "screen-a", color: [255, 0, 255] as Rgb },
      { identity: "user-b", name: "screen-b", color: [0, 255, 255] as Rgb },
    ];
    for (const s of sharers) {
      const p = await joinRoom(roomName, s.identity);
      const media = startSyntheticVideo(s.name, s.color);
      cleanups.push(media.stop);
      await p.room.localParticipant!.publishTrack(media.track, opts(TrackSource.SOURCE_SCREENSHARE, false));
    }

    const got = await viewer.waitFor(2);
    for (const s of sharers) {
      const entry = got.find((g) => g.identity === s.identity);
      expect(entry).toBeDefined();
      expect(entry!.pub.name).toBe(s.name);
      expect(entry!.pub.source).toBe(TrackSource.SOURCE_SCREENSHARE);
      const r = await readFrames(entry!.track, MIN_FRAMES);
      console.log(
        `[A-vs-B] ${s.identity}/${s.name} frames=${r.frames} recv=${r.width}x${r.height}` +
          ` rgb=${r.rgb.join(",")} firstFrame=${r.firstFrameMs}ms`,
      );
      expect(r.frames).toBeGreaterThanOrEqual(MIN_FRAMES);
      expect(rgbClose(r.rgb, s.color)).toBe(true);
    }
  },
  40_000,
);
