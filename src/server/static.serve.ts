import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

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
 * sementara agar tidak menimpa `dist/web` milik server produksi lain yang sedang jalan.
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
 * Aset di-resolve per request (bukan snapshot readdir saat start): `bun run build` yang menulis ulang dist/web saat
 * server jalan menghasilkan index.html baru yang menunjuk aset ber-hash baru; snapshot lama membuatnya 404 → layar
 * putih. Binary juga lewat jalur ini (statSync/Bun.file terbaca di /$bunfs, isinya tetap). Keamanan traversal di
 * `assetPath`. Asset → cache immutable; index.html → no-cache (selalu revalidasi agar rilis baru langsung terpakai).
 * Fallback = history API fallback standar (pola connect-history-api-fallback):
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
  const root = resolve(dir);
  const index = () => serveFile(indexPath, "no-cache");
  return {
    "/*": (req) => {
      const pathname = new URL(req.url).pathname;
      const asset = assetPath(root, pathname);
      if (asset) return serveFile(asset, IMMUTABLE);
      if (isNavigation(req)) return index();
      const ext = pathname.split("/").pop()?.split(".").slice(1).pop()?.toLowerCase();
      return ext && ASSET_EXTENSIONS.has(ext) ? new Response("Not Found", { status: 404 }) : index();
    },
  };
}

/**
 * Path file aset di dalam `root` untuk `pathname`, atau null. Tolak segmen `..`, NUL, backslash, dan hasil resolve
 * di luar `root` (prefix + separator); index.html dan sourcemap `.map` (source asli) tidak disajikan sebagai aset.
 */
function assetPath(root: string, pathname: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null; // percent-encoding rusak → bukan aset
  }
  if (rel.includes("\0") || rel.includes("\\") || rel.split("/").includes("..")) return null;
  rel = rel.replace(/^\/+/, "");
  if (!rel || rel === "index.html" || rel.endsWith(".map")) return null;
  const path = resolve(root, rel);
  if (!path.startsWith(root + sep)) return null;
  return statSync(path, { throwIfNoEntry: false })?.isFile() ? path : null;
}
function isNavigation(req: Request): boolean {
  return (req.method === "GET" || req.method === "HEAD") && (req.headers.get("accept") ?? "").includes("text/html");
}

function serveFile(path: string, cacheControl: string): Response {
  const file = Bun.file(path);
  return new Response(file, { headers: { "Content-Type": file.type, "Cache-Control": cacheControl } });
}
