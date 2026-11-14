import { describe, expect, test } from "bun:test";
import {
  clearSessionCookie,
  createSessionCookie,
  getSessionUser,
  readSessionUserId,
  SESSION_COOKIE_NAME,
} from "./auth.session";
import { openDb } from "./db";

const SECRET = "s".repeat(32); // test-only

/** Ubah nilai Set-Cookie menjadi request yang membawa cookie tersebut. */
function requestWith(setCookie: string): Request {
  const pair = setCookie.split(";")[0] ?? "";
  return new Request("http://x/api/me", { headers: { cookie: `other=1; ${pair}` } });
}

describe("auth.session", () => {
  test("roundtrip: cookie terbaca kembali sebagai user id", () => {
    const cookie = createSessionCookie("u1", SECRET, 60, false);
    expect(cookie).toStartWith(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly; SameSite=Lax; Path=/; Max-Age=60");
    expect(cookie).not.toContain("Secure");
    expect(readSessionUserId(requestWith(cookie), SECRET)).toBe("u1");
  });

  test("ttl default + Secure", () => {
    const cookie = createSessionCookie("u1", SECRET, undefined, true);
    expect(cookie).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    expect(cookie).toEndWith("; Secure");
  });

  test("tamper payload / signature / secret lain → null", () => {
    const cookie = createSessionCookie("u1", SECRET, 60, false);
    const pair = cookie.split(";")[0] ?? "";
    const [data, sig] = pair.slice(SESSION_COOKIE_NAME.length + 1).split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: 9e9 })).toString("base64url");
    const req = (v: string) => new Request("http://x", { headers: { cookie: `${SESSION_COOKIE_NAME}=${v}` } });
    expect(readSessionUserId(req(`${forged}.${sig}`), SECRET)).toBeNull();
    expect(readSessionUserId(req(`${data}.${sig}x`), SECRET)).toBeNull();
    expect(readSessionUserId(req(`${data}`), SECRET)).toBeNull();
    expect(readSessionUserId(requestWith(cookie), "t".repeat(32))).toBeNull();
    expect(readSessionUserId(new Request("http://x"), SECRET)).toBeNull();
  });

  test("expired → null", () => {
    const cookie = createSessionCookie("u1", SECRET, -1, false);
    expect(readSessionUserId(requestWith(cookie), SECRET)).toBeNull();
  });

  test("clearSessionCookie mengosongkan dengan Max-Age=0", () => {
    expect(clearSessionCookie(true)).toBe(`${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure`);
  });

  test("getSessionUser: lookup users, null bila user tidak ada", () => {
    const db = openDb(":memory:");
    db.run("INSERT INTO users (id, name, is_admin, created_at) VALUES ('admin', 'Admin', 1, 1)");
    expect(getSessionUser(requestWith(createSessionCookie("admin", SECRET, 60, false)), db, SECRET)).toEqual({
      id: "admin",
      name: "Admin",
      isAdmin: true,
    });
    expect(getSessionUser(requestWith(createSessionCookie("ghost", SECRET, 60, false)), db, SECRET)).toBeNull();
  });
});
