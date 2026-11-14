import pkg from "../../package.json" with { type: "json" };
import { type CliOverrides, parseCliArgs, type UserAction } from "./cli.args";
import { DOCS_TOPICS, ENV_EXAMPLE } from "./cli.docs";
import { COMMAND_HELP, GLOBAL_HELP } from "./cli.help";

/** Versi app dari package.json (di-embed saat `bun build --compile`). */
export const APP_VERSION: string = pkg.version;

/** I/O CLI; di-inject agar test bisa memakai io palsu. */
export interface CliIo {
  out(s: string): void;
  err(s: string): void;
  isTTY: boolean;
  env: Record<string, string | undefined>;
}

/** Satu baris user untuk `zoomin user` (tanpa data sensitif selain email, yang memang dibutuhkan operator). */
export type CliUserRow = { id: string; email: string; name: string; role: string; banned: boolean; createdAt: string };

/** Aksi server yang disediakan main.ts; CLI hanya memanggil dan mencetak hasilnya. */
export interface CliServerHooks {
  /** Start server, resolve saat server mati. */
  serve(overrides: CliOverrides): Promise<void>;
  migrate(overrides: CliOverrides): Promise<{ applied: string[] }>;
  check(overrides: CliOverrides): Promise<{ ok: true; summary: Record<string, string> } | { ok: false; errors: string[] }>;
  /** `zoomin user`: list → semua baris (dibatasi hooks); promote/unban → [baris setelah diubah]. Throw bila email tak ada. */
  user(overrides: CliOverrides, action: UserAction): Promise<CliUserRow[]>;
}

/** Tabel teks kolom rata kiri. */
function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => r[i]?.length ?? 0))) ?? [];
  return rows.map((r) => r.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd()).join("\n");
}

/** Warna ANSI hanya bila output TTY dan NO_COLOR tidak diset (no-color.org: nilai non-kosong). */
function painter(io: CliIo) {
  const on = io.isTTY && !io.env.NO_COLOR;
  const wrap = (code: string) => (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
  return { bold: wrap("1"), red: wrap("31"), green: wrap("32") };
}

/** Judul bagian `# X` di teks bantuan → `X:` (tebal bila warna aktif). */
function renderHelp(text: string, bold: (s: string) => string): string {
  return text.replace(/^# (.+)$/gm, (_, title: string) => bold(`${title}:`));
}

/** Jalankan CLI untuk argv pengguna; mengembalikan exit code (0 sukses, 1 gagal, 2 argumen salah). */
export async function runCli(argv: string[], io: CliIo, hooks: CliServerHooks): Promise<number> {
  const color = painter(io);
  const fail = (message: string, code: number) => {
    io.err(`${color.red("error:")} ${message}\n`);
    return code;
  };
  const command = parseCliArgs(argv);

  switch (command.kind) {
    case "error":
      return fail(command.message, command.exitCode);
    case "version":
      io.out(`zoomin ${APP_VERSION}\nbun ${Bun.version} ${process.platform}-${process.arch}\n`);
      return 0;
    case "help": {
      const text = command.topic === undefined ? GLOBAL_HELP : COMMAND_HELP[command.topic];
      if (!text) return fail(`Tidak ada bantuan untuk "${command.topic}". Perintah: ${Object.keys(COMMAND_HELP).join(", ")}`, 2);
      io.out(`${renderHelp(text, color.bold)}\n`);
      return 0;
    }
    case "docs": {
      const topic = command.topic ?? "usage";
      const render = DOCS_TOPICS[topic];
      if (!render) return fail(`Topik dokumentasi tidak dikenal: "${topic}". Topik: ${Object.keys(DOCS_TOPICS).join(", ")}`, 2);
      io.out(`${render().trimEnd()}\n`);
      return 0;
    }
    case "env-example":
      io.out(ENV_EXAMPLE.endsWith("\n") ? ENV_EXAMPLE : `${ENV_EXAMPLE}\n`);
      return 0;
  }

  // Perintah yang menyentuh server: error dari hooks dilaporkan dengan nama perintah, exit 1.
  try {
    switch (command.kind) {
      case "serve":
        await hooks.serve(command.overrides);
        return 0;
      case "migrate": {
        const { applied } = await hooks.migrate(command.overrides);
        io.out(applied.length ? `Migrasi diterapkan:\n${applied.map((m) => `  ${color.green("+")} ${m}`).join("\n")}\n` : "Database sudah terbaru, tidak ada migrasi baru.\n");
        return 0;
      }
      case "check": {
        const result = await hooks.check(command.overrides);
        if (!result.ok) return fail(`Konfigurasi tidak valid:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`, 1);
        const width = Math.max(...Object.keys(result.summary).map((k) => k.length));
        const rows = Object.entries(result.summary).map(([k, v]) => `  ${k.padEnd(width)}  ${v}`);
        io.out(`${color.green("Konfigurasi valid.")}\n${rows.join("\n")}\n`);
        return 0;
      }
      case "user": {
        const rows = await hooks.user(command.overrides, command.user);
        const action = command.user;
        if (action.action === "list") {
          if (!rows.length) {
            io.out("Belum ada user.\n");
            return 0;
          }
          const header = ["EMAIL", "PERAN", "STATUS", "NAMA", "DIBUAT", "ID"];
          io.out(`${table([header, ...rows.map((u) => [u.email, u.role, u.banned ? "diblokir" : "aktif", u.name, u.createdAt, u.id])])}\n`);
        } else if (action.action === "promote") {
          io.out(`${color.green("OK")} peran ${action.email} sekarang ${rows[0]?.role ?? action.role}\n`);
        } else {
          io.out(`${color.green("OK")} ${action.email} tidak lagi diblokir\n`);
        }
        return 0;
      }
    }
  } catch (cause) {
    return fail(`zoomin ${command.kind} gagal: ${cause instanceof Error ? cause.message : String(cause)}`, 1);
  }
}
