import { describe, expect, test } from "bun:test";
import { parseEnv } from "node:util";
import { loadConfig, REQUIRED_IN_PRODUCTION } from "../server/config";
import { ENV_EXAMPLE, envTable } from "./cli.docs";

/**
 * Semua variabel yang dibaca config.ts (`env.X` / `pick("X"`), di-scan agar daftar tidak drift dari kode.
 * static.serve.ts ikut di-scan: WEB_DIST_DIR dibaca di sana (resolveWebDir), bukan lewat loadConfig.
 */
const configSource = (
  await Promise.all(["../server/config.ts", "../server/static.serve.ts"].map((p) => Bun.file(new URL(p, import.meta.url)).text()))
).join("\n");
const CONFIG_VARS = [...new Set([...configSource.matchAll(/env\.([A-Z][A-Z0-9_]+)|pick\("([A-Z0-9_]+)"/g)].map((m) => m[1] ?? m[2] ?? ""))];

/** Baris aktif (bukan komentar/kosong) template. */
const activeLines = ENV_EXAMPLE.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));

describe(".env.example (zoomin env)", () => {
  test("scan config menemukan semua var wajib produksi", () => {
    expect(CONFIG_VARS.length).toBeGreaterThanOrEqual(14);
    for (const name of REQUIRED_IN_PRODUCTION) expect(CONFIG_VARS).toContain(name);
  });

  test("tiap variabel config punya baris aktif + komentar di template", () => {
    const parsed = parseEnv(ENV_EXAMPLE);
    for (const name of CONFIG_VARS) {
      expect(Object.keys(parsed)).toContain(name);
      const row = envTable().split("\n").find((r) => r.startsWith(`| \`${name}\` |`));
      expect(row?.split("|")[4]?.trim().length ?? 0).toBeGreaterThan(20);
    }
  });

  test("tidak ada var asing / trailing space / nilai mirip secret di baris aktif", () => {
    for (const line of activeLines) {
      expect(line).not.toMatch(/\s$/);
      const [name = "", value = ""] = line.split("=", 2);
      expect(CONFIG_VARS).toContain(name);
      expect(value).not.toMatch(/[A-Za-z0-9+/_-]{24,}/);
    }
    for (const name of REQUIRED_IN_PRODUCTION) expect(parseEnv(ENV_EXAMPLE)[name]).toBe("");
  });

  test("template apa adanya valid untuk loadConfig (dev)", () => {
    const config = loadConfig(parseEnv(ENV_EXAMPLE));
    expect(config.nodeEnv).toBe("development");
    expect(config.port).toBe(3000);
    expect(config.publicLivekitUrl).toBe("ws://127.0.0.1:7880");
    expect(config.tls).toBeUndefined();
  });

  test("template dengan NODE_ENV=production tanpa secret → gagal (secret kosong tidak lolos diam-diam)", () => {
    expect(() => loadConfig({ ...parseEnv(ENV_EXAMPLE), NODE_ENV: "production" })).toThrow("wajib diset di production");
  });

  test("envTable: satu baris per var, kolom wajib dari REQUIRED_IN_PRODUCTION, header bagian tidak bocor", () => {
    const rows = envTable().split("\n").slice(2);
    expect(rows.length).toBe(activeLines.length);
    for (const row of rows) {
      const name = row.match(/^\| `([A-Z0-9_]+)` \|/)?.[1] ?? "";
      expect(row.split(" | ")[2]).toBe((REQUIRED_IN_PRODUCTION as readonly string[]).includes(name) ? "ya" : "-");
      expect(row).not.toContain("──");
    }
    expect(envTable()).toContain("| `NODE_ENV` | `development` | - | Mode app");
  });
});
