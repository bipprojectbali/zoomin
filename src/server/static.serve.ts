import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Direktori hasil `bun run build` (scripts/build.web.ts), relatif ke WorkingDirectory. */
export const WEB_DIST_DIR = "dist/web";

const IMMUTABLE = "public, max-age=31536000, immutable";

type Handler = (req: Request) => Response;

/**
 * Route Bun.serve untuk SPA prebuild di produksi.
 * Hanya file yang ada saat start yang dirutekan (whitelist dari readdir), jadi path traversal tidak pernah
 * menyentuh filesystem. Asset ber-hash → cache immutable; index.html → no-cache (selalu revalidasi agar rilis
 * baru langsung terpakai). Path tak dikenal dengan ekstensi file → 404; selainnya → index.html (client-side routing).
 */
export function staticRoutes(dir: string = WEB_DIST_DIR): Record<string, Handler> {
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
      const last = new URL(req.url).pathname.split("/").pop() ?? "";
      return last.includes(".") ? new Response("Not Found", { status: 404 }) : index(req);
    },
  };
}

function fileHandler(path: string, cacheControl: string): Handler {
  const file = Bun.file(path);
  return () => new Response(file, { headers: { "Content-Type": file.type, "Cache-Control": cacheControl } });
}
