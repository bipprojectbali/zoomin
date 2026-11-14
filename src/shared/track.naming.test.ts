import { describe, expect, test } from "bun:test";
import { CAMERA_TRACK, MIC_TRACK, createScreenNamer, parseTrackName, screenAudioFor } from "./track.naming";

describe("createScreenNamer", () => {
  test("monoton mulai 1, pasangan video/audio konsisten", () => {
    const namer = createScreenNamer();
    expect(namer.next()).toEqual({ video: "screen-1", audio: "screen-1-audio", index: 1 });
    expect(namer.next()).toEqual({ video: "screen-2", audio: "screen-2-audio", index: 2 });
    expect(namer.next().index).toBe(3);
  });

  test("tidak pernah reuse nama dalam satu namer", () => {
    const namer = createScreenNamer();
    const names = Array.from({ length: 50 }, () => namer.next().video);
    expect(new Set(names).size).toBe(50);
  });

  test("namer terpisah (koneksi baru) mulai lagi dari 1", () => {
    createScreenNamer().next();
    expect(createScreenNamer().next().index).toBe(1);
  });

  test("nama hasil namer bisa di-parse balik", () => {
    const { video, audio, index } = createScreenNamer().next();
    expect(parseTrackName(video)).toEqual({ kind: "screen", index });
    expect(parseTrackName(audio)).toEqual({ kind: "screen-audio", index });
  });
});

describe("parseTrackName", () => {
  test("camera dan mic", () => {
    expect(parseTrackName(CAMERA_TRACK)).toEqual({ kind: "camera" });
    expect(parseTrackName(MIC_TRACK)).toEqual({ kind: "mic" });
    expect(CAMERA_TRACK).toBe("camera");
    expect(MIC_TRACK).toBe("mic");
  });

  test("screen-N dan screen-N-audio", () => {
    expect(parseTrackName("screen-1")).toEqual({ kind: "screen", index: 1 });
    expect(parseTrackName("screen-12")).toEqual({ kind: "screen", index: 12 });
    expect(parseTrackName("screen-3-audio")).toEqual({ kind: "screen-audio", index: 3 });
  });

  for (const bad of [
    "",
    "Camera",
    "camera ",
    "microphone",
    "screen",
    "screen-",
    "screen-0",
    "screen-01",
    "screen-x",
    "screen--1",
    "screen-1.5",
    "screen-1-audio-audio",
    "screen-1-video",
    "screen:1",
    " screen-1",
    "screen-99999999999999999999",
  ]) {
    test(`nama asing → null: ${JSON.stringify(bad)}`, () => {
      expect(parseTrackName(bad)).toBeNull();
    });
  }
});

describe("screenAudioFor", () => {
  test("screen-N → screen-N-audio", () => {
    expect(screenAudioFor("screen-4")).toBe("screen-4-audio");
  });

  test("bukan video layar ditolak", () => {
    expect(() => screenAudioFor("camera")).toThrow(/bukan nama track video layar/);
    expect(() => screenAudioFor("screen-1-audio")).toThrow(/screen-1-audio/);
    expect(() => screenAudioFor("screen-0")).toThrow();
  });
});
