import { parseArgs } from "node:util";

/** Override config dari flag CLI; hooks server yang menerapkannya ke config. */
export type CliOverrides = { port?: number; host?: string; dbPath?: string; envFile?: string };

/** Hasil parsing argv: perintah yang harus dijalankan runCli. */
export type CliCommand =
  | { kind: "serve"; overrides: CliOverrides }
  | { kind: "migrate"; overrides: CliOverrides }
  | { kind: "check"; overrides: CliOverrides }
  | { kind: "env-example" }
  | { kind: "version" }
  | { kind: "help"; topic?: string }
  | { kind: "docs"; topic?: string }
  | { kind: "error"; message: string; exitCode: 2 };

/** Nama perintah yang dikenal (dipakai juga oleh teks bantuan). */
export const COMMANDS = ["serve", "migrate", "check", "env", "docs", "help"] as const;
const OVERRIDE_COMMANDS = new Set(["serve", "migrate", "check"]);
const HINT = "Jalankan `zoomin --help` untuk daftar perintah dan opsi.";

const OPTIONS = {
  port: { type: "string", short: "p" },
  host: { type: "string", short: "H" },
  db: { type: "string" },
  "env-file": { type: "string" },
  version: { type: "boolean", short: "v" },
  help: { type: "boolean", short: "h" },
  // Boolean, topik diambil dari positional: parseArgs tidak mendukung nilai opsional (`-d` vs `-d env`).
  docs: { type: "boolean", short: "d" },
} as const;

/**
 * Argumen pengguna dari process.argv. Dev (`bun main.ts a`) maupun binary `bun build --compile`
 * sama-sama berbentuk [runtime, script, ...args]; di binary argv[0]="bun", argv[1]="/$bunfs/root/<nama>"
 * (diverifikasi Bun 1.4.2), jadi slice(2) benar untuk kedua mode.
 */
export function userArgs(processArgv: string[]): string[] {
  return processArgv.slice(2);
}

const error = (message: string): CliCommand => ({ kind: "error", message: `${message}\n${HINT}`, exitCode: 2 });

/** Parse argumen pengguna (tanpa runtime/script) menjadi CliCommand. Tidak pernah throw. */
export function parseCliArgs(argv: string[]): CliCommand {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (cause) {
    return error(translateParseError(cause));
  }
  const { values, positionals } = parsed;
  const [first, ...rest] = positionals;

  // Urutan standar CLI: --version menang atas apa pun, lalu --help, lalu --docs.
  if (values.version) return { kind: "version" };
  if (values.help) return { kind: "help", topic: first === "help" ? (rest[0] ?? "help") : first };
  if (values.docs) return rest.length ? error(`Argumen berlebih: ${rest.join(" ")}`) : { kind: "docs", topic: first };

  const command = first ?? "serve";
  if (!(COMMANDS as readonly string[]).includes(command)) return error(`Perintah tidak dikenal: ${command}`);
  if (command === "help" || command === "docs") {
    if (rest.length > 1) return error(`Argumen berlebih: ${rest.slice(1).join(" ")}`);
    return { kind: command, topic: rest[0] };
  }
  if (rest.length) return error(`Argumen berlebih untuk \`${command}\`: ${rest.join(" ")}`);

  const hasOverride = values.port !== undefined || values.host !== undefined || values.db !== undefined || values["env-file"] !== undefined;
  if (!OVERRIDE_COMMANDS.has(command)) {
    return hasOverride ? error(`Perintah \`${command}\` tidak menerima --port/--host/--db/--env-file`) : { kind: "env-example" };
  }

  const overrides: CliOverrides = {};
  if (values.port !== undefined) {
    const port = Number(values.port);
    if (!/^\d+$/.test(values.port) || port < 1 || port > 65535) return error(`Port tidak valid: "${values.port}" (harus bilangan bulat 1-65535)`);
    overrides.port = port;
  }
  if (values.host !== undefined) overrides.host = values.host;
  if (values.db !== undefined) overrides.dbPath = values.db;
  if (values["env-file"] !== undefined) overrides.envFile = values["env-file"];
  for (const [flag, value] of [["--host", values.host], ["--db", values.db], ["--env-file", values["env-file"]]] as const) {
    if (value !== undefined && !value.trim()) return error(`Nilai ${flag} tidak boleh kosong`);
  }
  return { kind: command as "serve" | "migrate" | "check", overrides };
}

/** Pesan error parseArgs (Inggris) → Bahasa Indonesia; opsi yang bermasalah tetap disebut. */
function translateParseError(cause: unknown): string {
  const code = (cause as { code?: string }).code;
  const message = cause instanceof Error ? cause.message : String(cause);
  const option = message.match(/'([^']+)'/)?.[1] ?? "";
  if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") return `Opsi tidak dikenal: ${option}`;
  if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
    return message.includes("argument missing") ? `Opsi ${option} butuh nilai` : `Nilai opsi tidak valid: ${option || message}`;
  }
  return `Argumen tidak valid: ${message}`;
}
