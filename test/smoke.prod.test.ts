import { describe, expect, test } from "bun:test";

// Smoke test produksi (M4): `SMOKE_URL=https://app.<domain> bun test test/smoke.prod.test.ts`.
// Tanpa SMOKE_URL seluruh suite dilewati, jadi aman di `bun test` lokal/CI.
const SMOKE_URL = process.env.SMOKE_URL?.replace(/\/+$/, "");
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;

function get(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SMOKE_URL}${path}`, { redirect: "manual", ...init });
}

describe.skipIf(!SMOKE_URL)(`smoke produksi (${SMOKE_URL ?? "SMOKE_URL kosong"})`, () => {
  test("SMOKE_URL memakai HTTPS (getDisplayMedia butuh secure context)", () => {
    expect(new URL(SMOKE_URL!).protocol).toBe("https:");
  });

  test("GET / → 200 HTML SPA dengan header keamanan dari Caddy", async () => {
    const res = await get("/");
    expect(res.status).toBe(HTTP_OK);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBeTruthy();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/connect-src [^;]*wss:\/\//);
  });

  test("GET /api/health → 200 {ok:true}", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(HTTP_OK);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("GET /api/me tanpa sesi → 401", async () => {
    expect((await get("/api/me")).status).toBe(HTTP_UNAUTHORIZED);
  });

  test("POST /api/rooms/x/token tanpa sesi → 401", async () => {
    const res = await get("/api/rooms/x/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(HTTP_UNAUTHORIZED);
  });
});
