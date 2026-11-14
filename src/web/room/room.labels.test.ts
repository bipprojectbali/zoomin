import { expect, test } from "bun:test";
import { ROOM_LABELS, deviceLabel, screenLabel, toggleState } from "./room.labels";

test("screenLabel: nama track layar → 'Screen N'; lainnya apa adanya", () => {
  expect(screenLabel("screen-1")).toBe("Screen 1");
  expect(screenLabel("screen-12")).toBe("Screen 12");
  expect(screenLabel("screen-1-audio")).toBe("screen-1-audio");
  expect(screenLabel("camera")).toBe("camera");
});

test("toggleState: nyala netral, mati merah, label = aksi berikutnya", () => {
  expect(toggleState("mic", true, false)).toEqual({ pressed: true, variant: "secondary", label: ROOM_LABELS.micOn, disabled: false });
  expect(toggleState("mic", false, false)).toEqual({ pressed: false, variant: "destructive", label: ROOM_LABELS.micOff, disabled: false });
  expect(toggleState("camera", true, true)).toMatchObject({ label: ROOM_LABELS.cameraOn, disabled: true });
  expect(toggleState("camera", false, false)).toMatchObject({ label: ROOM_LABELS.cameraOff, variant: "destructive" });
});

test("deviceLabel: label kosong (belum ada izin) → 'Device N'", () => {
  expect(deviceLabel({ label: "Headset USB" }, 0)).toBe("Headset USB");
  expect(deviceLabel({ label: "" }, 1)).toBe("Device 2");
});
