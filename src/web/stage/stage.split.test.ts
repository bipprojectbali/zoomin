import { describe, expect, test } from "bun:test";
import type { LayoutState } from "../../shared/layout.model";
import type { TrackLike } from "./stage.resolve";
import { sceneOf, showStrip, speakerSplit, splitStage } from "./stage.split";

// test-only
const track = (identity: string, trackName: string): TrackLike => ({
  participant: { identity },
  publication: { trackName },
  source: trackName.startsWith("screen-") ? "screen_share" : "camera",
});
const shared = (refs: [string, string][]): LayoutState => ({
  version: 4,
  template: "grid",
  slots: refs.map(([identity, trackName]) => ({ trackRef: { identity, trackName } })),
  updatedBy: "h",
  updatedAt: 1,
});
const ids = (xs: { ref: { identity: string; trackName: string } }[]) => xs.map((x) => `${x.ref.identity}/${x.ref.trackName}`);

describe("splitStage (S10)", () => {
  const tracks = [track("a", "camera"), track("a", "screen-1"), track("b", "camera"), track("c", "screen-1")];
  test("otomatis: panggung = layar saja, kamera + avatar di strip orang", () => {
    const s = splitStage(null, tracks, [{ identity: "d", trackName: "camera" }]);
    expect(s.slots.map((x) => x.slot.trackRef.identity)).toEqual(["a", "c"]);
    expect(ids(s.people)).toEqual(["a/camera", "b/camera", "d/camera"]);
    expect(s.screens).toEqual([]);
    expect(s.hasContent).toBe(true);
  });
  test("layout bersama: kamera yang ditaruh tidak ganda di strip; layar di luar layout → screens", () => {
    const s = splitStage(shared([["b", "camera"], ["a", "screen-1"]]), tracks, []);
    expect(ids(s.people)).toEqual(["a/camera"]);
    expect(ids(s.screens)).toEqual(["c/screen-1"]);
    expect(ids(s.everyone)).toEqual(["a/camera", "b/camera"]);
  });
  test("tanpa layar & layout bersama kosong → tidak ada konten", () => {
    const cams = [track("a", "camera")];
    expect(splitStage(shared([]), cams, []).hasContent).toBe(false);
    expect(splitStage(shared([["a", "camera"]]), cams, []).hasContent).toBe(true);
    expect(splitStage(null, cams, []).hasContent).toBe(false);
  });
});

describe("sceneOf / showStrip (S11)", () => {
  test("auto: konten → stage; tanpa konten + layout bersama → gallery; tanpa layout bersama → stage (grid kamera otomatis)", () => {
    expect(sceneOf("auto", true, true)).toBe("stage");
    expect(sceneOf("auto", false, true)).toBe("gallery");
    expect(sceneOf("auto", false, false)).toBe("stage");
    expect(sceneOf("gallery", true, true)).toBe("gallery");
    expect(sceneOf("speaker", false, false)).toBe("speaker");
    expect(sceneOf("content", false, true)).toBe("stage");
  });
  test("strip: tidak di gallery/content/hidden/kosong", () => {
    expect(showStrip("auto", "stage", "right", 2)).toBe(true);
    expect(showStrip("speaker", "speaker", "bottom", 1)).toBe(true);
    expect(showStrip("auto", "gallery", "right", 2)).toBe(false);
    expect(showStrip("content", "stage", "right", 2)).toBe(false);
    expect(showStrip("auto", "stage", "hidden", 2)).toBe(false);
    expect(showStrip("auto", "stage", "right", 0)).toBe(false);
  });
});

describe("speakerSplit", () => {
  const items = ["a", "b", "c"].map((identity) => ({ ref: { identity, trackName: "camera" }, track: null }));
  test("pembicara besar, sisanya strip; tidak dikenal → orang pertama; kosong → null", () => {
    const { main, rest } = speakerSplit(items, "b");
    expect(main?.ref.identity).toBe("b");
    expect(rest.map((x) => x.ref.identity)).toEqual(["a", "c"]);
    expect(speakerSplit(items, null).main?.ref.identity).toBe("a");
    expect(speakerSplit([], "a")).toEqual({ main: null, rest: [] });
  });
});
