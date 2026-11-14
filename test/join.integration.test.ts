import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Room, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import type { TokenResponse } from "../src/shared/api.types";
import { createApi } from "../src/server/api";
import { createRoom } from "../src/server/rooms.repository";
import { createTestDeps, createTestUser } from "./auth.helpers";
import { startSyntheticAudio, startSyntheticVideo } from "./synthetic-media";

// Butuh LiveKit dev nyata (`livekit-server --dev`, ws://127.0.0.1:7880, devkey/secret).
const VIEWER_PUBLISH_TIMEOUT_MS = 20_000;

const deps = createTestDeps();
const { db, roomService } = deps;
const app = createApi(deps);
const roomId = `join-${crypto.randomUUID().slice(0, 8)}`;
const participant = new Room();
const viewer = new Room();
const stops: (() => Promise<void>)[] = [];

async function addMember(alias: string, role: "participant" | "viewer"): Promise<string> {
  const { user, cookie } = await createTestUser(deps, { email: `${alias}@example.test`, name: alias });
  db.query("INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)").run(roomId, user.id, role);
  return cookie;
}

async function fetchToken(cookie: string): Promise<TokenResponse> {
  const res = await app.handle(
    new Request(`http://localhost/api/rooms/${roomId}/token`, { method: "POST", headers: { cookie } }),
  );
  if (res.status !== 200) throw new Error(`fetchToken: room=${roomId} status ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

function publishMic(room: Room) {
  const audio = startSyntheticAudio("mic");
  stops.push(audio.stop);
  return room.localParticipant!.publishTrack(audio.track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
}

beforeAll(async () => {
  const admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
  createRoom(db, { id: roomId, title: "Join IT", createdBy: admin.user.id });
  const [p, v] = await Promise.all([fetchToken(await addMember("p1", "participant")), fetchToken(await addMember("v1", "viewer"))]);
  expect([p.role, v.role]).toEqual(["participant", "viewer"]);
  await participant.connect(p.url, p.token);
  await viewer.connect(v.url, v.token);
});

afterAll(async () => {
  await Promise.all([participant.disconnect(), viewer.disconnect()]);
  await Promise.all(stops.map((stop) => stop()));
  await roomService.deleteRoom(roomId);
});

describe("join dengan token dari endpoint", () => {
  test("participant & viewer terkoneksi", () => {
    expect(participant.isConnected).toBe(true);
    expect(viewer.isConnected).toBe(true);
  });

  test("participant publish mic + camera", async () => {
    const mic = await publishMic(participant);
    const video = startSyntheticVideo("camera", [0, 128, 255]);
    stops.push(video.stop);
    const cam = await participant.localParticipant!.publishTrack(
      video.track,
      new TrackPublishOptions({ source: TrackSource.SOURCE_CAMERA }),
    );
    expect(mic.sid).toMatch(/^TR_/);
    expect(cam.sid).toMatch(/^TR_/);
  });

  test(
    "viewer publish ditolak server (timeout)",
    async () => {
      const err = await publishMic(viewer).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(Error);
    },
    VIEWER_PUBLISH_TIMEOUT_MS,
  );
});
