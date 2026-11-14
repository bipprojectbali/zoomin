import { join } from "node:path";

/**
 * Aset SEO bernama tetap (ikon, manifest, og-image) di root situs. Sumber: src/web/public (scripts/build.icons.ts);
 * build.web.ts menyalinnya ke dist/web, binary menanamnya bersama dist/web. Nama tidak di-hash agar crawler, OS
 * (`/favicon.ico`, `/apple-touch-icon.png`) dan ikon di manifest bisa merujuk URL stabil → cache pendek, bukan immutable.
 */
export const PUBLIC_FILES = ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "og-image.png", "site.webmanifest"] as const;

/** Folder aset publik saat dev (HTML import): langsung dari source. */
export const DEV_PUBLIC_DIR = join(import.meta.dir, "../web/public");

const PUBLIC_CACHE = "public, max-age=86400";
const SEO_TEXT_CACHE = "public, max-age=3600";

/** Path yang tidak perlu diindeks (butuh login / per-undangan); landing `/` tetap boleh. */
export const DISALLOWED_PATHS = ["/app", "/rooms", "/invite", "/admin", "/dev", "/settings", "/api"] as const;

const baseUrl = (publicAppUrl: string) => publicAppUrl.replace(/\/+$/, "");

/** Isi robots.txt; Sitemap absolut dari PUBLIC_APP_URL. */
export function robotsTxt(publicAppUrl: string): string {
  return ["User-agent: *", "Allow: /", ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`), "", `Sitemap: ${baseUrl(publicAppUrl)}/sitemap.xml`, ""].join("\n");
}

/** Sitemap hanya berisi landing; halaman lain privat. */
export function sitemapXml(publicAppUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl(publicAppUrl)}/</loc></url>
</urlset>
`;
}

/** Route Bun.serve untuk robots.txt, sitemap.xml, dan PUBLIC_FILES dari `publicDir`. */
export function seoRoutes(publicAppUrl: string, publicDir: string): Record<string, () => Response> {
  const text = (body: string, type: string) => () => new Response(body, { headers: { "Content-Type": type, "Cache-Control": SEO_TEXT_CACHE } });
  const routes: Record<string, () => Response> = {
    "/robots.txt": text(robotsTxt(publicAppUrl), "text/plain; charset=utf-8"),
    "/sitemap.xml": text(sitemapXml(publicAppUrl), "application/xml; charset=utf-8"),
  };
  for (const name of PUBLIC_FILES) {
    const path = join(publicDir, name);
    routes[`/${name}`] = () => {
      const file = Bun.file(path);
      return new Response(file, { headers: { "Content-Type": file.type, "Cache-Control": PUBLIC_CACHE } });
    };
  }
  return routes;
}

/** Meta/link di index.html yang URL-nya wajib absolut (Open Graph, Twitter, canonical). */
const ABSOLUTE_URL_ATTRS: [selector: string, attr: string][] = [
  ['link[rel="canonical"]', "href"],
  ['meta[property="og:url"]', "content"],
  ['meta[property="og:image"]', "content"],
  ['meta[name="twitter:image"]', "content"],
];

/**
 * Ubah URL relatif `/...` di meta SEO index.html jadi absolut berbasis PUBLIC_APP_URL. Source index.html sengaja
 * relatif (bukan placeholder) karena dev server Bun menyajikan HTML import apa adanya: dev tetap valid tanpa
 * substitusi, produksi/binary mendapat URL absolut yang dibutuhkan crawler.
 */
export function absolutizeSeoUrls(res: Response, publicAppUrl: string): Response {
  const base = baseUrl(publicAppUrl);
  let rewriter = new HTMLRewriter();
  for (const [selector, attr] of ABSOLUTE_URL_ATTRS) {
    rewriter = rewriter.on(selector, {
      element(el) {
        const value = el.getAttribute(attr);
        if (value?.startsWith("/") && !value.startsWith("//")) el.setAttribute(attr, base + value);
      },
    });
  }
  return rewriter.transform(res);
}
