/**
 * Regresi mode produksi (project "prod": SPA hasil build di folder sementara + static.serve.ts). Dev server Bun
 * menyajikan SPA sendiri, jadi bug fallback SPA produksi tidak tertangkap project dev. Jalur login test-only mati di
 * production (A12), jadi test di sini memakai halaman yang tidak butuh sesi.
 */
import { expect, test } from "./fixtures";

test("prod: /api/test/login tidak ada (404) walau ZOOMIN_TEST_AUTH=1", async ({ request }) => {
  const res = await request.post("/api/test/login", { data: { email: "siapa@contoh.test" } });
  expect(res.status()).toBe(404);
});

test("prod: semua aset yang dirujuk index.html tersaji 200", async ({ page, request }) => {
  const scripts: string[] = [];
  page.on("response", (r) => {
    if (/\.(js|css)$/.test(new URL(r.url()).pathname)) scripts.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto("/");
  await expect(page.getByTestId("landing")).toBeVisible();
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((s) => !s.startsWith("200 "))).toEqual([]);
  const html = await (await request.get("/", { headers: { accept: "text/html" } })).text();
  for (const src of html.match(/\/[\w.-]+\.(?:js|css)/g) ?? []) expect((await request.get(src)).status(), src).toBe(200);
});

test("prod: URL undangan bertitik → app tampil (invite-error), bukan 404", async ({ page, allowConsole }) => {
  // Token palsu → preview 400 invite_invalid (dicatat InvitePage + Chromium); yang diuji: index.html tersaji.
  allowConsole(/^invite: preview gagal/, /status of 400/);
  const res = await page.goto("/invite/bukan-token.tanda-tangan");
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("invite-error")).toBeVisible();
});

test("prod: deep link /rooms/:id + reload → app tampil (login dengan next)", async ({ page }) => {
  await page.goto("/rooms/room-apa-saja");
  await expect(page).toHaveURL(/\/login\?next=%2Frooms%2Froom-apa-saja$/);
  const res = await page.reload();
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("login-google")).toBeVisible();
});

test("prod: meta SEO absolut dari PUBLIC_APP_URL; ikon, manifest, robots, sitemap tersaji", async ({ page, request, baseURL }) => {
  await page.goto("/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${baseURL}/og-image.png`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${baseURL}/`);
  for (const sel of ['link[rel="icon"][type="image/svg+xml"]', 'link[rel="apple-touch-icon"]', 'link[rel="manifest"]']) {
    const href = await page.locator(sel).getAttribute("href");
    expect((await request.get(href!)).status(), sel).toBe(200);
  }
  for (const path of ["/favicon.ico", "/og-image.png", "/site.webmanifest", "/robots.txt", "/sitemap.xml"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  expect(await (await request.get("/robots.txt")).text()).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
});
