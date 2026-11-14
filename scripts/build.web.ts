import { cpSync, renameSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import tailwind from "bun-plugin-tailwind";

/**
 * Build produksi SPA → dist/web (statis, disajikan src/server/static.serve.ts saat NODE_ENV=production).
 * Plugin Tailwind dipasang di sini karena CLI `bun build` tidak membaca `[serve.static]` bunfig.toml.
 * Out dir bisa diganti `--outdir <dir>` atau env `WEB_OUT_DIR` (e2e: folder sementara, pasangan WEB_DIST_DIR server)
 * agar build tidak menimpa dist/web milik server produksi yang sedang jalan. Hanya out dir itu yang dibersihkan.
 */
const { values } = parseArgs({ args: Bun.argv.slice(2), options: { outdir: { type: "string" } } });
const OUT_DIR = values.outdir?.trim() || process.env.WEB_OUT_DIR?.trim() || "dist/web";

rmSync(OUT_DIR, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["src/web/index.html"],
  outdir: OUT_DIR,
  target: "browser",
  splitting: true,
  minify: true,
  // External: .map tetap di dist lokal untuk debugging, tanpa komentar sourceMappingURL dan tidak disajikan server.
  sourcemap: "external",
  // Semua kecuali index.html ber-hash → aman di-cache immutable.
  // Path absolut: index.html juga disajikan untuk /rooms/x (fallback SPA), path relatif "./" akan salah resolve.
  publicPath: "/",
  naming: { entry: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [tailwind],
});

if (!result.success) {
  console.error(`build.web: Bun.build gagal untuk src/web/index.html (${result.logs.length} log)`);
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Entry HTML ikut pola [hash]; server mencari nama tetap index.html (disajikan no-cache).
const html = result.outputs.find((o) => o.path.endsWith(".html"));
if (!html) {
  console.error("build.web: output tidak berisi index.html");
  process.exit(1);
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const rows = await Promise.all(
  result.outputs
    .filter((o) => !o.path.endsWith(".map"))
    .map(async (o) => {
      const bytes = new Uint8Array(await o.arrayBuffer());
      return { file: o === html ? "index.html" : relative(OUT_DIR, o.path), kind: o.kind, raw: kb(bytes.length), gzip: kb(Bun.gzipSync(bytes).length) };
    }),
);
console.table(rows);
renameSync(html.path, join(OUT_DIR, "index.html"));
// Ikon/manifest/og-image bernama tetap di root (disajikan seoRoutes); salinan ber-hash di atas dipakai <link> index.html.
cpSync("src/web/public", OUT_DIR, { recursive: true });
