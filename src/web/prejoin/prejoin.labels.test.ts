import { describe, expect, test } from "bun:test";
import { inviteSubtitle, joinButtonState, PREJOIN_TEXT, roleKeptNote, roleSubtitle, toggleState } from "./prejoin.labels";

describe("label peran", () => {
  test("roleSubtitle", () => {
    expect(roleSubtitle("participant")).toBe("Anda akan masuk sebagai Peserta");
    expect(roleSubtitle("viewer")).toBe("Anda akan masuk sebagai Penonton");
  });

  test("inviteSubtitle tamu vs bersesi", () => {
    expect(inviteSubtitle({ effectiveRole: "viewer", currentUser: null })).toBe("Anda akan masuk sebagai Penonton");
    expect(inviteSubtitle({ effectiveRole: "participant", currentUser: { name: "Budi" } })).toBe(
      "Anda akan masuk sebagai Budi (Peserta)",
    );
  });

  test("roleKeptNote hanya bila peran tidak diturunkan", () => {
    expect(roleKeptNote({ role: "participant", effectiveRole: "participant" })).toBeNull();
    expect(roleKeptNote({ role: "viewer", effectiveRole: "participant" })).toContain("tetap Peserta");
  });
});

describe("toggleState", () => {
  test("nyala → pressed, tone on, label matikan", () => {
    expect(toggleState("camera", true, false)).toEqual({ pressed: true, tone: "on", label: PREJOIN_TEXT.turnOff.camera });
  });
  test("mati → tidak pressed, tone off (merah), label nyalakan", () => {
    expect(toggleState("mic", false, false)).toEqual({ pressed: false, tone: "off", label: PREJOIN_TEXT.turnOn.mic });
  });
  test("nyala tapi gagal → blocked, tidak pressed", () => {
    expect(toggleState("mic", true, true)).toEqual({ pressed: false, tone: "blocked", label: PREJOIN_TEXT.unavailable.mic });
  });
  test("mati & ada error lama → tetap off", () => {
    expect(toggleState("camera", false, true).tone).toBe("off");
  });
});

describe("joinButtonState", () => {
  test("busy → disabled + label menghubungkan", () => {
    expect(joinButtonState(true, false, "")).toEqual({ disabled: true, label: PREJOIN_TEXT.joining });
  });
  test("nama wajib kosong/spasi → disabled", () => {
    expect(joinButtonState(false, true, "  ").disabled).toBe(true);
  });
  test("nama terisi / tidak diminta → aktif", () => {
    expect(joinButtonState(false, true, "Citra")).toEqual({ disabled: false, label: PREJOIN_TEXT.join });
    expect(joinButtonState(false, false, "").disabled).toBe(false);
  });
});
