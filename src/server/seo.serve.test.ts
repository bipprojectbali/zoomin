import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDeps } from "../../test/auth.helpers";
import { LANDING_META } from "../web/landing/landing.copy";
import type { ApiDeps } from "./api.deps";
import { createServer } from "./main";
import { absolutizeSeoUrls, DEV_PUBLIC_DIR, PUBLIC_FILES, robotsTxt, sitemapXml } from "./seo.serve";

const APP_URL = "https://meet.example.test"; // test-only
const SOURCE_INDEX = readFileSync(join(import.meta.dir, "../web/index.html"), "utf8");

test("robots.txt: allow /, disallow halaman privat, Sitemap dari PUBLIC_APP_URL (slash akhir dibuang)", () => {
  const txt = robotsTxt(`${APP_URL}/`);
  expect(txt).toContain("User-agent: *\nAllow: /\n");
  for (const p of ["/app", "/rooms", "/invite", "/admin", "/dev", "/settings", "/api"]) expect(txt).toContain(`Disallow: ${p}\n`);
  expect(txt).toContain(`Sitemap: ${APP_URL}/sitemap.xml`);
});

test("sitemap.xml hanya berisi landing dari PUBLIC_APP_URL", () => {
  const xml = sitemapXml(APP_URL);
  expect(xml).toContain(`<loc>${APP_URL}/</loc>`);
  expect(xml.match(/<loc>/g)).toHaveLength(1);
});

test("absolutizeSeoUrls: canonical/og:url/og:image/twitter:image jadi absolut; URL absolut & lain tak disentuh", async () => {
  const res = absolutizeSeoUrls(new Response(SOURCE_INDEX, { headers: { "Content-Type": "text/html" } }), APP_URL);
  const html = await res.text();
  expect(html).toContain(`<link rel="canonical" href="${APP_URL}/" />`);
  expect(html).toContain(`<meta property="og:url" content="${APP_URL}/" />`);
  expect(html).toContain(`<meta property="og:image" content="${APP_URL}/og-image.png" />`);
  expect(html).toContain(`<meta name="twitter:image" content="${APP_URL}/og-image.png" />`);
  expect(html).toContain('href="./public/favicon.svg"');
  const abs = await absolutizeSeoUrls(new Response('<meta property="og:image" content="https://cdn.test/x.png">'), APP_URL).text();
  expect(abs).toContain('content="https://cdn.test/x.png"');
});

test("index.html: meta SEO lengkap, sinkron dengan LANDING_META, tanpa domain hardcoded", () => {
  expect(SOURCE_INDEX).toContain(`<title>${LANDING_META.title}</title>`);
  for (const key of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    expect(SOURCE_INDEX).toContain(`<meta ${key} content="${LANDING_META.description}" />`);
  }
  for (const key of ['property="og:title"', 'name="twitter:title"']) expect(SOURCE_INDEX).toContain(`<meta ${key} content="${LANDING_META.title}" />`);
  expect(SOURCE_INDEX).toContain('<meta name="twitter:card" content="summary_large_image" />');
  expect(SOURCE_INDEX).not.toMatch(/https?:\/\//);
});

test("PUBLIC_FILES = isi src/web/public (generator & route tidak drift); manifest merujuk ikon yang ada", () => {
  expect(readdirSync(DEV_PUBLIC_DIR).sort()).toEqual([...PUBLIC_FILES].sort());
  const manifest = JSON.parse(readFileSync(join(DEV_PUBLIC_DIR, "site.webmanifest"), "utf8")) as { icons: { src: string }[] };
  for (const icon of manifest.icons) expect(PUBLIC_FILES).toContain(icon.src.slice(1) as (typeof PUBLIC_FILES)[number]);
});

describe("route SEO di server", () => {
  const base = createTestDeps({ PUBLIC_APP_URL: APP_URL });
  // Dist palsu (test-only) berisi index.html source + aset publik, meniru output build.web.ts.
  const dist = mkdtempSync(join(tmpdir(), "zoomin-seo-"));
  writeFileSync(join(dist, "index.html"), SOURCE_INDEX);
  for (const name of PUBLIC_FILES) writeFileSync(join(dist, name), readFileSync(join(DEV_PUBLIC_DIR, name)));
  const prod = createServer({ ...base, config: { ...base.config, nodeEnv: "production" } } satisfies ApiDeps, 0, dist);
  const dev = createServer(base, 0, dist);
  afterAll(() => {
    prod.stop(true);
    dev.stop(true);
    rmSync(dist, { recursive: true, force: true });
  });

  const TYPES: Record<string, string> = {
    "/favicon.ico": "image/x-icon",
    "/favicon.svg": "image/svg+xml",
    "/apple-touch-icon.png": "image/png",
    "/icon-192.png": "image/png",
    "/icon-512.png": "image/png",
    "/og-image.png": "image/png",
    "/site.webmanifest": "application/manifest+json",
    "/robots.txt": "text/plain",
    "/sitemap.xml": "application/xml",
  };

  test("prod & dev: aset SEO 200 dengan content-type benar dan cache pendek (bukan immutable)", async () => {
    for (const server of [prod, dev]) {
      for (const [path, type] of Object.entries(TYPES)) {
        const res = await fetch(new URL(path, server.url));
        expect(res.status, `${server.url}${path}`).toBe(200);
        expect(res.headers.get("content-type")).toContain(type);
        expect(res.headers.get("cache-control")).toStartWith("public, max-age=");
        expect(res.headers.get("cache-control")).not.toContain("immutable");
      }
    }
    expect(await (await fetch(new URL("/robots.txt", prod.url))).text()).toContain(`Sitemap: ${APP_URL}/sitemap.xml`);
  });

  test("prod: index.html (semua route SPA) berisi og:image absolut dari PUBLIC_APP_URL, tetap no-cache", async () => {
    for (const path of ["/", "/rooms/abc"]) {
      const res = await fetch(new URL(path, prod.url), { headers: { accept: "text/html" } });
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toContain(`<meta property="og:image" content="${APP_URL}/og-image.png" />`);
    }
  });
});
