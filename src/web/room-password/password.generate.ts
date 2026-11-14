/** Alfabet tanpa karakter yang mudah tertukar saat dibacakan/diketik ulang (0/O/o, 1/l/I). */
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const GENERATED_PASSWORD_LENGTH = 10;

/** Password acak (W2): `crypto.getRandomValues` + rejection sampling agar tiap karakter seragam (tanpa bias modulo). */
export function generatePassword(
  length = GENERATED_PASSWORD_LENGTH,
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const n = PASSWORD_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = "";
  while (out.length < length) {
    for (const byte of random(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += PASSWORD_ALPHABET[byte % n];
    }
  }
  return out;
}
