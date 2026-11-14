import { cpSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";

/**
 * Single-file binary `zoomin` lewat `Bun.build({ compile })` (native Bun, tanpa dependency baru).
 *
 * Pendekatan (diverifikasi Bun 1.4.2): SPA di-prebuild dulu oleh scripts/build.web.ts (Tailwind, minify, hash), lalu
 * file dist/web ditanam lewat `compile.assets` dan disajikan static.serve.ts dengan header cache yang sama seperti
 * `bun run start`. Fullstack HTML import di dalam binary tidak dipakai karena header cache-nya tidak bisa diatur
 * (immutable/no-cache) dan butuh plugin Tailwind kedua kali; cabang HTML import dev dibuang lewat define
 * ZOOMIN_BINARY. Migrasi SQL, README, dan .env.example di-embed sebagai import `type: "text"`.
 *
 * Pakai: `bun scripts/build.binary.ts [--target bun-linux-x64 ...] [--all] [--outdir bin]`
 */
const ROOT = join(import.meta.dir, "..");
// Sama dengan out dir build.web.ts (env WEB_OUT_DIR): test binary membangun SPA ke tmpdir agar dist/web tidak ditimpa.
const WEB_DIR = process.env.WEB_OUT_DIR?.trim() || "dist/web";
const EMBED_DIR = "dist/embed/web";
const ALL_TARGETS = ["bun-linux-x64", "bun-linux-arm64", "bun-darwin-arm64", "bun-darwin-x64", "bun-windows-x64"];

const { values } = parseArgs({
  options: { target: { type: "string", multiple: true }, all: { type: "boolean" }, outdir: { type: "string" } },
});
const hostTarget = `bun-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const targets = values.all ? ALL_TARGETS : (values.target ?? [hostTarget]);
const outdir = values.outdir ?? join(ROOT, "bin");

process.chdir(ROOT);
// build.web.ts adalah skrip top-level (exit(1) bila gagal); import = menjalankannya.
await import("./build.web.ts");

// Sourcemap tidak ditanam (tidak disajikan server, hanya menambah ukuran). Folder asset ditanam dengan nama basename-nya
// (diverifikasi: `compile.assets: ["dist/embed/web"]` → /$bunfs/root/web), jadi salin ke folder bernama "web".
rmSync(EMBED_DIR, { recursive: true, force: true });
cpSync(WEB_DIR, EMBED_DIR, { recursive: true, filter: (src) => !src.endsWith(".map") });

mkdirSync(outdir, { recursive: true });
const rows: { target: string; file: string; size: string }[] = [];
let failed = 0;
for (const target of targets) {
  const outfile = join(outdir, `zoomin-${target.replace(/^bun-/, "")}${target.includes("windows") ? ".exe" : ""}`);
  const result = await Bun.build({
    entrypoints: ["src/server/main.ts"],
    minify: true,
    sourcemap: "none",
    define: {
      "process.env.ZOOMIN_BINARY": JSON.stringify("1"),
      // Tanpa define, Bun.build meng-inline process.env.NODE_ENV = "development" untuk library. config.ts membaca
      // NODE_ENV dari env runtime (bukan process.env.NODE_ENV literal), jadi override NODE_ENV saat run tetap berlaku.
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    compile: {
      target: target as Bun.Build.CompileTarget,
      outfile,
      assets: [EMBED_DIR],
      // .env di cwd tetap dimuat otomatis (sama seperti `bun run start`); bunfig.toml repo tidak relevan untuk binary.
      autoloadBunfig: false,
    },
  });
  if (!result.success) {
    failed++;
    console.error(`build.binary: compile ${target} gagal (${result.logs.length} log)`);
    for (const log of result.logs) console.error(log);
    continue;
  }
  rows.push({ target, file: relative(ROOT, outfile), size: `${(statSync(outfile).size / 1024 / 1024).toFixed(1)} MB` });
}
if (rows.length) console.table(rows);
if (failed) process.exit(1);
