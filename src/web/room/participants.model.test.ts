import { describe, expect, test } from "bun:test";
import {
  countScreens,
  displayName,
  initials,
  presenceToastText,
  roleFromMetadata,
  screenToastText,
  sortParticipants,
  type ParticipantLike,
} from "./participants.model";

const p = (identity: string, name: string, role: string | null, isLocal = false): ParticipantLike => ({
  identity,
  name,
  isLocal,
  metadata: role === null ? undefined : JSON.stringify({ role }),
});

describe("roleFromMetadata", () => {
  test("role valid dibaca, sisanya null", () => {
    expect(roleFromMetadata('{"role":"admin"}')).toBe("admin");
    expect(roleFromMetadata('{"role":"viewer"}')).toBe("viewer");
    expect(roleFromMetadata('{"role":"root"}')).toBeNull();
    expect(roleFromMetadata("bukan json")).toBeNull();
    expect(roleFromMetadata("null")).toBeNull();
    expect(roleFromMetadata(undefined)).toBeNull();
  });
});

describe("displayName & initials", () => {
  test("nama kosong → identity; inisial dua kata", () => {
    expect(displayName({ identity: "u_1", name: "  " })).toBe("u_1");
    expect(displayName({ identity: "u_1", name: "Budi" })).toBe("Budi");
    expect(initials("budi santoso wijaya")).toBe("BS");
    expect(initials("Ani")).toBe("A");
    expect(initials("  ")).toBe("");
  });
});

describe("sortParticipants", () => {
  test("Anda dulu, lalu admin, peserta, penonton, tanpa role; dalam grup urut nama", () => {
    const list = [
      p("v", "Vina", "viewer"),
      p("x", "Xeno", null),
      p("b", "Budi", "participant"),
      p("a2", "Zaki", "admin"),
      p("me", "Saya", "viewer", true),
      p("a1", "Ani", "admin"),
      p("c", "Citra", "participant"),
    ];
    expect(sortParticipants(list).map((x) => x.identity)).toEqual(["me", "a1", "a2", "b", "c", "v", "x"]);
    expect(list[0]!.identity).toBe("v"); // input tidak dimutasi
  });
});

describe("countScreens", () => {
  test("hanya screen-N video yang dihitung", () => {
    expect(countScreens(["camera", "mic", "screen-1", "screen-1-audio", "screen-3", "lain"])).toBe(2);
    expect(countScreens([])).toBe(0);
  });
});

describe("presenceToastText", () => {
  test("agregasi nama", () => {
    expect(presenceToastText([], "join")).toBeNull();
    expect(presenceToastText(["Budi"], "join")).toBe("Budi bergabung");
    expect(presenceToastText(["Budi", "Ani"], "leave")).toBe("Budi dan Ani keluar");
    expect(presenceToastText(["Budi", "Ani", "Citra"], "join")).toBe("3 peserta bergabung");
  });
});

describe("screenToastText", () => {
  test("screen-N → teks bernomor; track lain → null", () => {
    expect(screenToastText("Budi", "screen-2", true)).toBe("Budi mulai membagikan layar 2");
    expect(screenToastText("Budi", "screen-2", false)).toBe("Budi berhenti membagikan layar 2");
    expect(screenToastText("Budi", "screen-2-audio", true)).toBeNull();
    expect(screenToastText("Budi", "camera", true)).toBeNull();
  });
});
