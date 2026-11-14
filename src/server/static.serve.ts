import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Direktori hasil `bun run build` (scripts/build.web.ts), relatif ke WorkingDirectory. */
export const WEB_DIST_DIR = "dist/web";

/**
 * Lokasi SPA saat runtime. Binary (scripts/build.binary.ts) menanam salinan dist/web lewat `compile.assets` sebagai
 * folder "web" di bawah `import.meta.dir` (/$bunfs/root), terbaca via node:fs/Bun.file; dari source tetap relatif
 * ke WorkingDirectory. Folder khusus (bukan root bunfs) agar file entry binary sendiri tidak ikut dirutekan.
 */
export const DEFAULT_WEB_DIR = resolveWebDir();

/**
 * Direktori SPA produksi. Env `WEB_DIST_DIR` (opsional) menimpa default — mis. e2e menyajikan build di folder
 * sementara agar tidak menimpa `dist/web` milik server produksi lain yang sedang jalan (file dist dibaca sekali saat start).
 */
export function resolveWebDir(env: Record<string, string | undefined> = process.env, standalone = Bun.isStandaloneExecutable): string {
  return env.WEB_DIST_DIR?.trim() || (standalone ? join(import.meta.dir, "web") : WEB_DIST_DIR);
}

const IMMUTABLE = "public, max-age=31536000, immutable";

/** Ekstensi aset statis: path tak dikenal berakhiran ini (non-navigasi) → 404, bukan index.html. */
const ASSET_EXTENSIONS = new Set(["js", "mjs", "css", "map", "json", "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "avif", "woff", "woff2", "ttf", "txt", "webmanifest", "wasm"]);

type Handler = (req: Request) => Response;

/**
 * Route Bun.serve untuk SPA prebuild di produksi.
 * Hanya file yang ada saat start yang dirutekan (whitelist dari readdir), jadi path traversal tidak pernah
 * menyentuh filesystem. Asset ber-hash → cache immutable; index.html → no-cache (selalu revalidasi agar rilis
 * baru langsung terpakai). Fallback = history API fallback standar (pola connect-history-api-fallback):
 * - navigasi (GET/HEAD + Accept text/html) → selalu index.html, apa pun path-nya;
 * - selainnya → 404 hanya bila segmen terakhir berakhiran ekstensi aset (ASSET_EXTENSIONS), lain itu index.html.
 * Kenapa bukan "segmen mengandung titik → 404": token undangan `base64url(payload).signature` mengandung titik,
 * sehingga `/invite/<token>` di produksi sempat 404 (dev tidak kena karena disajikan dev server Bun).
 * `/api/*` tidak lewat sini: route Elysia lebih spesifik dari "/*".
 */
export function staticRoutes(dir: string = DEFAULT_WEB_DIR): Record<string, Handler> {
  const indexPath = join(dir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`staticRoutes: ${indexPath} tidak ada; jalankan \`bun run build\` sebelum start produksi`);
  }
  const index = fileHandler(indexPath, "no-cache");
  const routes: Record<string, Handler> = {};
  for (const rel of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const path = join(dir, rel);
    // Sourcemap tidak disajikan publik (source asli); ".map" jatuh ke fallback → 404.
    if (rel === "index.html" || rel.endsWith(".map") || !statSync(path).isFile()) continue;
    routes[`/${rel.split("\\").join("/")}`] = fileHandler(path, IMMUTABLE);
  }
  return {
    ...routes,
    "/*": (req) => {
      if (isNavigation(req)) return index(req);
      const ext = new URL(req.url).pathname.split("/").pop()?.split(".").slice(1).pop()?.toLowerCase();
      return ext && ASSET_EXTENSIONS.has(ext) ? new Response("Not Found", { status: 404 }) : index(req);
    },
  };
}

function isNavigation(req: Request): boolean {
  return (req.method === "GET" || req.method === "HEAD") && (req.headers.get("accept") ?? "").includes("text/html");
}

function fileHandler(path: string, cacheControl: string): Handler {
  const file = Bun.file(path);
  return () => new Response(file, { headers: { "Content-Type": file.type, "Cache-Control": cacheControl } });
}
