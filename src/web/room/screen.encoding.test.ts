import { describe, expect, test } from "bun:test";
import { Track } from "livekit-client";
import { applyContentHint, screenAudioPublishOptions, screenPublishOptions } from "./screen.encoding";

describe("screenPublishOptions", () => {
  test("share ke-1: vp8, simulcast, h1080fps15 (2,5 Mbps @15fps)", () => {
    const o = screenPublishOptions(1);
    expect(o.source).toBe(Track.Source.ScreenShare);
    expect(o.videoCodec).toBe("vp8");
    expect(o.simulcast).toBe(true);
    expect(o.screenShareEncoding).toEqual({ maxBitrate: 2_500_000, maxFramerate: 15, priority: "medium" });
    expect(o.name).toBeUndefined();
  });

  test.each([2, 3, 10])("share ke-%d: h720fps15 (1,5 Mbps @15fps)", (n) => {
    const o = screenPublishOptions(n);
    expect(o.videoCodec).toBe("vp8");
    expect(o.simulcast).toBe(true);
    expect(o.screenShareEncoding).toEqual({ maxBitrate: 1_500_000, maxFramerate: 15, priority: "medium" });
  });

  test("layer simulcast = h360fps3 (640x360, 200 kbps @3fps)", () => {
    for (const n of [1, 2]) {
      const layers = screenPublishOptions(n).screenShareSimulcastLayers ?? [];
      expect(layers).toHaveLength(1);
      const [low] = layers;
      expect(low?.width).toBe(640);
      expect(low?.height).toBe(360);
      expect(low?.encoding.maxBitrate).toBe(200_000);
      expect(low?.encoding.maxFramerate).toBe(3);
    }
  });
});

test("screenAudioPublishOptions: source ScreenShareAudio", () => {
  expect(screenAudioPublishOptions().source).toBe(Track.Source.ScreenShareAudio);
});

test("applyContentHint: default detail, bisa text", () => {
  const track = { contentHint: "" } as MediaStreamTrack; // test-only
  applyContentHint(track);
  expect(track.contentHint).toBe("detail");
  applyContentHint(track, "text");
  expect(track.contentHint).toBe("text");
});
