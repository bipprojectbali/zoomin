import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { createInvite, verifyInvite } from "./auth.invite";

const SECRET = "s".repeat(32); // test-only
const NOW = 1_700_000_000;

describe("auth.invite", () => {
  test("roundtrip", () => {
    const inv = createInvite({ roomId: "room-1", role: "participant", ttlSeconds: 60 }, SECRET, NOW);
    expect(verifyInvite(inv, SECRET, NOW + 59)).toEqual({ roomId: "room-1", role: "participant", exp: NOW + 60 });
  });

  test("nonce acak: dua undangan identik berbeda string", () => {
    const a = createInvite({ roomId: "r1", role: "viewer", ttlSeconds: 60 }, SECRET, NOW);
    const b = createInvite({ roomId: "r1", role: "viewer", ttlSeconds: 60 }, SECRET, NOW);
    expect(a).not.toBe(b);
  });

  test("tamper payload / signature / secret lain → null", () => {
    const inv = createInvite({ roomId: "r1", role: "viewer", ttlSeconds: 60 }, SECRET, NOW);
    const [data, sig] = inv.split(".") as [string, string];
    const upgraded = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(data, "base64url").toString()), role: "host" }),
    ).toString("base64url");
    expect(verifyInvite(`${upgraded}.${sig}`, SECRET, NOW)).toBeNull();
    // Karakter pengganti harus pasti beda: sig acak (nonce) dan karakter terakhirnya 'A' dengan peluang 1/16.
    const tamperedSig = `${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
    expect(verifyInvite(`${data}.${tamperedSig}`, SECRET, NOW)).toBeNull();
    expect(verifyInvite(inv, "x".repeat(32), NOW)).toBeNull();
    expect(verifyInvite("tanpa-titik", SECRET, NOW)).toBeNull();
  });

  test("expired → null", () => {
    const inv = createInvite({ roomId: "r1", role: "viewer", ttlSeconds: 60 }, SECRET, NOW);
    expect(verifyInvite(inv, SECRET, NOW + 60)).toBeNull();
  });

  test("role asing / roomId tidak aman → null walau bertanda tangan sah", () => {
    // Paksa role asing lewat cast: createInvite menandatangani apa pun yang diberikan.
    const badRole = createInvite({ roomId: "r1", role: "owner" as never, ttlSeconds: 60 }, SECRET, NOW);
    expect(verifyInvite(badRole, SECRET, NOW)).toBeNull();
    const badRoom = createInvite({ roomId: "../x", role: "viewer", ttlSeconds: 60 }, SECRET, NOW);
    expect(verifyInvite(badRoom, SECRET, NOW)).toBeNull();
  });

  test("signature undangan bukan HMAC mentah BETTER_AUTH_SECRET (kunci turunan)", () => {
    const inv = createInvite({ roomId: "r1", role: "viewer", ttlSeconds: 60 }, SECRET, NOW);
    const [data, sig] = inv.split(".") as [string, string];
    expect(createHmac("sha256", SECRET).update(data).digest("base64url")).not.toBe(sig);
  });
});
