import { describe, expect, test } from "bun:test";
import { initialsOf, kindLabel, personOf, rememberNames, shouldMirror, tileTitle } from "./stage.tile.logic";

// test-only
const people = [{ identity: "u_me", name: "Admin" }, { identity: "u_budi", name: "Budi Peserta" }, { identity: "u_anon", name: "" }];

describe("personOf", () => {
  test("nama dari daftar peserta, penanda lokal", () => {
    expect(personOf("u_budi", people, "u_me")).toEqual({ name: "Budi Peserta", isLocal: false, present: true });
    expect(personOf("u_me", people, "u_me")).toEqual({ name: "Admin", isLocal: true, present: true });
  });
  test("tidak ada di room & tak dikenal → 'Participant', tanpa ID internal", () => {
    const p = personOf("u_eZXQTEqZF10bDVlkJKzh", people, "u_me");
    expect(p).toEqual({ name: "Participant", isLocal: false, present: false });
    expect(tileTitle(p, "screen-2")).toBe("Participant · left · Screen 2");
  });
  test("cache nama: peserta yang keluar tetap bernama asli (QA-03)", () => {
    const known = new Map<string, string>();
    rememberNames(known, people);
    rememberNames(known, [{ identity: "u_budi", name: "  " }]); // nama kosong tidak menimpa
    const left = personOf("u_budi", [], "u_me", known);
    expect(left).toEqual({ name: "Budi Peserta", isLocal: false, present: false });
    expect(tileTitle(left, "screen-2")).toBe("Budi Peserta · left · Screen 2");
    expect(known.has("u_anon")).toBe(false);
  });
  test("nama kosong → 'Participant', bukan identity", () => {
    expect(personOf("u_anon", people, "u_me").name).toBe("Participant");
  });
});

describe("kindLabel & tileTitle", () => {
  test("kamera / layar N / di luar konvensi", () => {
    expect(kindLabel("camera")).toBe("Camera");
    expect(kindLabel("screen-2")).toBe("Screen 2");
    expect(kindLabel("weird")).toBe("Video");
  });
  test("judul menyertakan (Anda) untuk diri sendiri", () => {
    expect(tileTitle(personOf("u_me", people, "u_me"), "screen-2")).toBe("Admin (you) · Screen 2");
    expect(tileTitle(personOf("u_budi", people, "u_me"), "camera")).toBe("Budi Peserta · Camera");
  });
});

describe("initialsOf", () => {
  test("kata pertama + terakhir, uppercase; kosong → ?", () => {
    expect(initialsOf("budi santoso wijaya")).toBe("BW");
    expect(initialsOf("Admin")).toBe("A");
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("shouldMirror", () => {
  test("hanya kamera milik sendiri", () => {
    expect(shouldMirror("camera", true)).toBe(true);
    expect(shouldMirror("camera", false)).toBe(false);
    expect(shouldMirror("screen_share", true)).toBe(false);
  });
});
