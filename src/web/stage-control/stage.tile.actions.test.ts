import { describe, expect, mock, test } from "bun:test";
import type { StageRequest } from "../../shared/api.types";
import { STAGE_CONTROL_TEXT as TEXT } from "./stage-control.labels";
import { requestTileActions } from "./stage.tile.actions";

// test-only
const ref = (trackName: string) => ({ identity: "me", trackName });
const deps = (own: StageRequest | null = null) => ({ own, request: mock(async () => {}), cancel: mock(async () => {}) });

describe("requestTileActions", () => {
  test("bukan milik sendiri / bukan layar → tanpa aksi", () => {
    expect(requestTileActions(ref("screen-1"), false, deps())).toEqual([]);
    expect(requestTileActions(ref("camera"), true, deps())).toEqual([]);
  });
  test("layar sendiri: request show / focus", () => {
    const d = deps();
    const items = requestTileActions(ref("screen-2"), true, d);
    expect(items.map((i) => i.label)).toEqual([TEXT.requestShow, TEXT.requestFocus]);
    items[1]!.onSelect();
    expect(d.request).toHaveBeenCalledWith("screen-2", "focus");
  });
  test("pending untuk track ini → Cancel request", () => {
    const d = deps({ trackName: "screen-2" } as StageRequest);
    const items = requestTileActions(ref("screen-2"), true, d);
    expect(items.map((i) => i.label)).toEqual([TEXT.cancelRequest]);
    items[0]!.onSelect();
    expect(d.cancel).toHaveBeenCalled();
    expect(requestTileActions(ref("screen-1"), true, d)).toHaveLength(2);
  });
});
