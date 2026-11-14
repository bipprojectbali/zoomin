import { describe, expect, test } from "bun:test";
import { GENERATED_PASSWORD_LENGTH, generatePassword, PASSWORD_ALPHABET } from "./password.generate";

describe("generatePassword", () => {
  test("10 karakter dari alfabet tanpa karakter ambigu", () => {
    const pw = generatePassword();
    expect(pw).toHaveLength(GENERATED_PASSWORD_LENGTH);
    for (const c of pw) expect(PASSWORD_ALPHABET).toContain(c);
    expect(PASSWORD_ALPHABET).not.toMatch(/[0O1lIo]/);
  });

  test("byte di atas batas rejection dibuang (tanpa bias modulo)", () => {
    // Panggilan 1: [57, 255…] → "B" (255 >= 224 = 256 - 256 % 56 dibuang). Panggilan 2: [57, 0…] → "B", "A".
    let call = 0;
    const random = (b: Uint8Array) => {
      b.fill(call++ === 0 ? 255 : 0);
      b[0] = 57;
      return b;
    };
    expect(generatePassword(3, random)).toBe("BBA");
  });

  test("hasil berbeda antar panggilan", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
