import { describe, expect, test } from "bun:test";
import type { LayoutState } from "../../shared/layout.model";
import { autoLayout, avatarRefs, focusMainIndex, resolveSlots, type TrackLike } from "./stage.resolve";

// test-only
const track = (identity: string, trackName: string): TrackLike => ({
  participant: { identity, name: identity.toUpperCase() },
  publication: { trackName },
  source: trackName.startsWith("screen-") ? "screen_share" : "camera",
});
const layoutOf = (refs: [string, string][]): LayoutState => ({
  version: 1,
  template: "grid",
  slots: refs.map(([identity, trackName]) => ({ trackRef: { identity, trackName } })),
  updatedBy: "admin",
  updatedAt: 1,
});

describe("resolveSlots", () => {
  test("slot terisi track yang cocok, slot tanpa track kosong, sisa jadi extras", () => {
    const a = track("a", "camera");
    const bScreen = track("b", "screen-1");
    const c = track("c", "camera");
    const { slots, extras } = resolveSlots(layoutOf([["b", "screen-1"], ["x", "camera"], ["a", "camera"]]), [a, bScreen, c]);
    expect(slots.map((s) => s.track)).toEqual([bScreen, null, a]);
    expect(slots.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(slots[1]!.slot.trackRef).toEqual({ identity: "x", trackName: "camera" });
    expect(slots.map((s) => s.live)).toEqual([true, false, true]);
    expect(extras).toEqual([{ ref: { identity: "c", trackName: "camera" }, track: c }]);
  });
  test("identity sama, trackName beda tidak tertukar", () => {
    const s1 = track("a", "screen-1");
    const s2 = track("a", "screen-2");
    const { slots, extras } = resolveSlots(layoutOf([["a", "screen-2"]]), [s1, s2]);
    expect(slots[0]!.track).toBe(s2);
    expect(extras.map((x) => x.track)).toEqual([s1]);
  });
});

const refs = (l: LayoutState) => l.slots.map((s) => `${s.trackRef.identity}/${s.trackRef.trackName}`);

describe("autoLayout", () => {
  test("ada layar → slot hanya layar (urut numeric), kamera ke strip lainnya; version 0", () => {
    const tracks = [track("a", "camera"), track("b", "screen-2"), track("c", "camera"), track("b", "screen-10"), track("a", "screen-1")];
    const l = autoLayout(tracks);
    expect(l.template).toBe("grid");
    expect(l.version).toBe(0);
    expect(refs(l)).toEqual(["a/screen-1", "b/screen-2", "b/screen-10"]);
    expect(resolveSlots(l, tracks).extras.map((x) => x.ref.identity)).toEqual(["a", "c"]);
  });
  test("1 track → grid (penuh); 2 layar → berdampingan", () => {
    expect(autoLayout([track("a", "camera")]).template).toBe("grid");
    const two = autoLayout([track("a", "screen-1"), track("a", "camera"), track("b", "screen-1")]);
    expect(two.template).toBe("side-by-side");
    expect(refs(two)).toEqual(["a/screen-1", "b/screen-1"]);
  });
  test("tanpa layar → semua kamera; ≥3 → grid; tanpa track → kosong", () => {
    const cams = [track("c", "camera"), track("a", "camera"), track("b", "camera")];
    const l = autoLayout(cams);
    expect(l.template).toBe("grid");
    expect(refs(l)).toEqual(["a/camera", "b/camera", "c/camera"]);
    expect(resolveSlots(l, cams).extras).toEqual([]);
    expect(autoLayout([]).slots).toEqual([]);
  });
});

// test-only
const meta = (role: string) => JSON.stringify({ role });
const avatar = (identity: string) => ({ identity, trackName: "camera" });

describe("avatarRefs (QA-01)", () => {
  test("host/participant tanpa kamera dapat avatar; penonton, role tak dikenal, dan yang punya kamera tidak", () => {
    const people = [
      { identity: "adm", metadata: meta("host") },
      { identity: "p1", metadata: meta("participant") },
      { identity: "cam", metadata: meta("participant") },
      { identity: "v", metadata: meta("viewer") },
      { identity: "x", metadata: "bukan json" },
      { identity: "y" },
    ];
    expect(avatarRefs(people, [track("cam", "camera"), track("p1", "screen-1")])).toEqual([avatar("adm"), avatar("p1")]);
  });
  test("tanpa layar → avatar ikut grid; ada layar → avatar ke extras; slot avatar = live", () => {
    const cams = [track("b", "camera")];
    const l = autoLayout(cams, [avatar("a")]);
    expect(refs(l)).toEqual(["a/camera", "b/camera"]);
    const r = resolveSlots(l, cams, [avatar("a")]);
    expect(r.slots.map((s) => [s.track === null, s.live])).toEqual([[true, true], [false, true]]);
    const withScreen = [...cams, track("b", "screen-1")];
    const ls = autoLayout(withScreen, [avatar("a")]);
    expect(refs(ls)).toEqual(["b/screen-1"]);
    expect(resolveSlots(ls, withScreen, [avatar("a")]).extras).toEqual([
      { ref: avatar("b"), track: cams[0]! },
      { ref: avatar("a"), track: null },
    ]);
  });
});

describe("focusMainIndex (QA-03)", () => {
  test("fokus aktif → 0; tidak → aktif pertama; semua mati → -1", () => {
    expect(focusMainIndex([{ live: true }, { live: true }])).toBe(0);
    expect(focusMainIndex([{ live: false }, { live: false }, { live: true }])).toBe(2);
    expect(focusMainIndex([{ live: false }])).toBe(-1);
    expect(focusMainIndex([])).toBe(-1);
  });
});
