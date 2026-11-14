import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AudioSource, LocalAudioTrack, Room, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import { TokenVerifier } from "livekit-server-sdk";
import { livekitConfig } from "./config";
import { createJoinToken, JOIN_TOKEN_TTL_SECONDS } from "./token";

const verifier = new TokenVerifier(livekitConfig.apiKey, livekitConfig.apiSecret);
const PUBLISH_SOURCES = ["camera", "microphone", "screen_share", "screen_share_audio"];
const ROOM = "unit-room";

async function decode(role: "admin" | "participant" | "viewer") {
  return verifier.verify(await createJoinToken({ room: ROOM, identity: `u-${role}`, name: "Nama", role }));
}

describe("createJoinToken grants", () => {
  test("participant: publish 4 sources + subscribe, bukan admin", async () => {
    const c = await decode("participant");
    expect(c.sub).toBe("u-participant");
    expect(c.name).toBe("Nama");
    expect(c.video?.room).toBe(ROOM);
    expect(c.video?.roomJoin).toBe(true);
    expect(c.video?.canPublish).toBe(true);
    expect(c.video?.canSubscribe).toBe(true);
    expect(c.video?.canPublishSources as unknown as string[]).toEqual(PUBLISH_SOURCES);
    expect(c.video?.roomAdmin).toBeUndefined();
  });

  test("viewer: hanya subscribe", async () => {
    const c = await decode("viewer");
    expect(c.video?.roomJoin).toBe(true);
    expect(c.video?.canSubscribe).toBe(true);
    expect(c.video?.canPublish).toBe(false);
    expect(c.video?.canPublishData).toBe(false);
    expect(c.video?.canPublishSources).toBeUndefined();
    expect(c.video?.roomAdmin).toBeUndefined();
  });

  test("admin: participant + roomAdmin", async () => {
    const c = await decode("admin");
    expect(c.video?.canPublish).toBe(true);
    expect(c.video?.canPublishSources as unknown as string[]).toEqual(PUBLISH_SOURCES);
    expect(c.video?.roomAdmin).toBe(true);
    expect(JSON.parse(c.metadata ?? "{}")).toEqual({ role: "admin" });
  });

  test("TTL sesuai konstanta", async () => {
    const c = await decode("viewer");
    expect(c.exp! - c.nbf!).toBe(JOIN_TOKEN_TTL_SECONDS);
  });

  test.each([
    { room: "", identity: "a" },
    { room: "r", identity: "" },
    { room: "../etc", identity: "a" },
    { room: "r", identity: "a b" },
  ])("input invalid ditolak: %o", async (input) => {
    await expect(createJoinToken({ ...input, role: "viewer" })).rejects.toThrow("createJoinToken");
  });
});

describe("integrasi LiveKit server", () => {
  const room = `it-${crypto.randomUUID().slice(0, 8)}`;
  const participant = new Room();
  const viewer = new Room();
  const sources: AudioSource[] = [];

  async function publishAudio(r: Room) {
    const source = new AudioSource(48000, 1);
    sources.push(source);
    const track = LocalAudioTrack.createAudioTrack("mic", source);
    const opts = new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE });
    return r.localParticipant!.publishTrack(track, opts);
  }

  beforeAll(async () => {
    const [pTok, vTok] = await Promise.all([
      createJoinToken({ room, identity: "p1", role: "participant" }),
      createJoinToken({ room, identity: "v1", role: "viewer" }),
    ]);
    await participant.connect(livekitConfig.url, pTok);
    await viewer.connect(livekitConfig.url, vTok);
  });

  afterAll(async () => {
    await Promise.all([participant.disconnect(), viewer.disconnect()]);
    await Promise.all(sources.map((s) => s.close()));
  });

  test("keduanya terkoneksi", () => {
    expect(participant.isConnected).toBe(true);
    expect(viewer.isConnected).toBe(true);
  });

  test("participant bisa publish audio", async () => {
    const pub = await publishAudio(participant);
    expect(pub.sid).toMatch(/^TR_/);
  });

  test("viewer tidak bisa publish audio", async () => {
    const started = performance.now();
    const err = await publishAudio(viewer).then(() => null, (e: unknown) => e);
    console.info(`viewer publish ditolak setelah ${Math.round(performance.now() - started)}ms: ${String(err)}`);
    expect(err).toBeInstanceOf(Error);
  }, 15_000);
});
