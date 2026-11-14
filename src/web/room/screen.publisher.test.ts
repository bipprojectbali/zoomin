import { describe, expect, test } from "bun:test";
import { Track, type Room, type TrackPublishOptions } from "livekit-client";
import { ScreenPublisher, ScreenShareCancelled } from "./screen.publisher";

// test-only: MediaStreamTrack palsu dengan event `ended`.
function fakeTrack(kind: "video" | "audio") {
  const listeners = new Set<() => void>();
  return {
    kind,
    contentHint: "",
    stopped: false,
    stop() {
      this.stopped = true;
    },
    addEventListener: (_: "ended", cb: () => void) => listeners.add(cb),
    removeEventListener: (_: "ended", cb: () => void) => listeners.delete(cb),
    fireEnded: () => [...listeners].forEach((cb) => cb()),
  };
}
type FakeTrack = ReturnType<typeof fakeTrack>;

// test-only: rangkai publisher dengan getDisplayMedia/publish/unpublish palsu.
function setup(opts: { audio?: boolean; fail?: Error } = {}) {
  const published: { track: FakeTrack; options: TrackPublishOptions }[] = [];
  const unpublished: FakeTrack[] = [];
  const videos: FakeTrack[] = [];
  const pub = new ScreenPublisher({ localParticipant: {} } as Room, {
    getDisplayMedia: async () => {
      if (opts.fail) throw opts.fail;
      const video = fakeTrack("video");
      videos.push(video);
      const audio = opts.audio ? [fakeTrack("audio")] : [];
      return { getVideoTracks: () => [video], getAudioTracks: () => audio } as unknown as MediaStream;
    },
    publish: async (track, options) => {
      published.push({ track: track as unknown as FakeTrack, options });
    },
    unpublish: async (track) => {
      unpublished.push(track as unknown as FakeTrack);
    },
  });
  return { pub, published, unpublished, videos };
}

const domError = (name: string) => Object.assign(new Error(name), { name });

describe("ScreenPublisher", () => {
  test("3x addScreen → screen-1..3, share ke-2 pakai 720p, contentHint detail", async () => {
    const { pub, published, videos } = setup();
    const names = [(await pub.addScreen()).video, (await pub.addScreen()).video, (await pub.addScreen()).video];
    expect(names).toEqual(["screen-1", "screen-2", "screen-3"]);
    expect(published.map((p) => p.options.name)).toEqual(names);
    expect(published[0]?.options.screenShareEncoding?.maxBitrate).toBe(2_500_000);
    expect(published[1]?.options.screenShareEncoding?.maxBitrate).toBe(1_500_000);
    expect(published[1]?.options.source).toBe(Track.Source.ScreenShare);
    expect(videos[0]?.contentHint).toBe("detail");
    expect(pub.list().map((s) => s.video)).toEqual(names);
  });

  test("ended → unpublish dipanggil, list berkurang, onChange terpanggil", async () => {
    const { pub, unpublished, videos } = setup();
    await pub.addScreen();
    await pub.addScreen();
    const seen: string[][] = [];
    const off = pub.onChange((s) => seen.push(s.map((x) => x.video)));
    videos[0]?.fireEnded();
    await Promise.resolve();
    expect(unpublished).toEqual([videos[0]!]);
    expect(pub.list().map((s) => s.video)).toEqual(["screen-2"]);
    expect(seen).toEqual([["screen-2"]]);
    off();
    videos[0]?.fireEnded(); // ended kedua setelah stop = no-op
    await pub.stopScreen("screen-2");
    expect(seen).toHaveLength(1);
    expect(unpublished).toHaveLength(2);
  });

  test("stop lalu add lagi → screen-4 (nomor tidak dipakai ulang)", async () => {
    const { pub } = setup();
    for (let i = 0; i < 3; i++) await pub.addScreen();
    await pub.stopScreen("screen-3");
    expect((await pub.addScreen()).video).toBe("screen-4");
  });

  test.each(["NotAllowedError", "AbortError"])("picker batal (%s) → ScreenShareCancelled, tanpa publish", async (name) => {
    const { pub, published } = setup({ fail: domError(name) });
    await expect(pub.addScreen()).rejects.toBeInstanceOf(ScreenShareCancelled);
    expect(published).toHaveLength(0);
    expect(pub.list()).toHaveLength(0);
  });

  test("error lain propagate dengan context, bukan ScreenShareCancelled", async () => {
    const { pub } = setup({ fail: domError("NotReadableError") });
    const err = await pub.addScreen().catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ScreenShareCancelled);
    expect((err as Error).message).toContain("getDisplayMedia failed (NotReadableError");
  });

  test("audio ada → screen-N-audio dipublish dengan source ScreenShareAudio; stop unpublish keduanya", async () => {
    const { pub, published, unpublished } = setup({ audio: true });
    expect(await pub.addScreen()).toEqual({ video: "screen-1", audio: "screen-1-audio" });
    expect(published[1]?.options.name).toBe("screen-1-audio");
    expect(published[1]?.options.source).toBe(Track.Source.ScreenShareAudio);
    await pub.stopScreen("screen-1");
    expect(unpublished.map((t) => t.kind)).toEqual(["video", "audio"]);
  });

  test("dispose menghentikan semua layar", async () => {
    const { pub, unpublished } = setup();
    await pub.addScreen();
    await pub.addScreen();
    await pub.dispose();
    expect(pub.list()).toHaveLength(0);
    expect(unpublished).toHaveLength(2);
  });
});
