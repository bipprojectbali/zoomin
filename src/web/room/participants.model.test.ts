import { describe, expect, test } from "bun:test";
import {
  countScreens,
  displayName,
  imageFromMetadata,
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
    expect(roleFromMetadata('{"role":"host"}')).toBe("host");
    expect(roleFromMetadata('{"role":"viewer"}')).toBe("viewer");
    expect(roleFromMetadata('{"role":"root"}')).toBeNull();
    expect(roleFromMetadata('{"role":"admin"}')).toBeNull(); // peran room lama, sudah diganti host
    expect(roleFromMetadata("bukan json")).toBeNull();
    expect(roleFromMetadata("null")).toBeNull();
    expect(roleFromMetadata(undefined)).toBeNull();
  });
});

describe("imageFromMetadata", () => {
  test("https valid dibaca; non-https, kepanjangan, metadata lama/rusak → null", () => {
    const url = "https://lh3.googleusercontent.com/a/x=s96-c"; // test-only
    expect(imageFromMetadata(JSON.stringify({ role: "host", image: url }))).toBe(url);
    expect(imageFromMetadata(JSON.stringify({ role: "host", image: null }))).toBeNull();
    expect(imageFromMetadata('{"role":"host"}')).toBeNull(); // metadata lama tanpa image
    expect(imageFromMetadata(JSON.stringify({ image: "http://x.test/a.png" }))).toBeNull();
    expect(imageFromMetadata(JSON.stringify({ image: "javascript:alert(1)" }))).toBeNull();
    expect(imageFromMetadata(JSON.stringify({ image: "bukan url" }))).toBeNull();
    expect(imageFromMetadata(JSON.stringify({ image: 42 }))).toBeNull();
    expect(imageFromMetadata(JSON.stringify({ image: `https://x.test/${"a".repeat(2048)}` }))).toBeNull();
    expect(imageFromMetadata("bukan json")).toBeNull();
    expect(imageFromMetadata(undefined)).toBeNull();
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
  test("Anda dulu, lalu host, peserta, penonton, tanpa role; dalam grup urut nama", () => {
    const list = [
      p("v", "Vina", "viewer"),
      p("x", "Xeno", null),
      p("b", "Budi", "participant"),
      p("a2", "Zaki", "host"),
      p("me", "Saya", "viewer", true),
      p("a1", "Ani", "host"),
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
    expect(screenToastText("Budi", "screen-2", true)).toBe("Budi mulai membagikan Layar 2");
    expect(screenToastText("Budi", "screen-2", false)).toBe("Budi berhenti membagikan Layar 2");
    expect(screenToastText("Budi", "screen-2-audio", true)).toBeNull();
    expect(screenToastText("Budi", "camera", true)).toBeNull();
  });
});
