// Embed markdown/env ke binary: import `type: "text"` di-inline oleh `bun build --compile` (diverifikasi Bun 1.4.2:
// binary tetap mencetak isi file setelah file sumber dihapus), jadi --docs tidak butuh file di disk.
import readme from "../../README.md" with { type: "text" };
import deployReadme from "../../deploy/README.md" with { type: "text" };
import envExample from "../../.env.example" with { type: "text" };
import { REQUIRED_IN_PRODUCTION } from "../server/config";

/** Isi .env.example apa adanya (perintah `zoomin env`). */
export const ENV_EXAMPLE: string = envExample;

const REQUIRED_IN_PROD = new Set<string>(REQUIRED_IN_PRODUCTION);

/** Bagian `## <judul>` dari markdown sampai heading level-2 berikutnya. */
function section(markdown: string, title: string): string {
  const start = markdown.indexOf(`\n## ${title}\n`);
  if (start < 0) return "";
  const end = markdown.indexOf("\n## ", start + 1);
  return markdown.slice(start + 1, end < 0 ? undefined : end).trim();
}

/** Tabel markdown variabel env dari .env.example: blok komentar tepat di atas baris VAR= (tanpa baris kosong) jadi keterangan. */
export function envTable(example: string = envExample): string {
  const rows = ["| Var | Default | Wajib di produksi | Keterangan |", "|---|---|---|---|"];
  let notes: string[] = [];
  for (const line of example.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      notes.push(trimmed.replace(/^#\s?/, ""));
      continue;
    }
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      notes = [];
      continue;
    }
    const [, name = "", value = ""] = match;
    const note = notes.join(" ");
    rows.push(`| \`${name}\` | ${value ? `\`${value}\`` : "(kosong)"} | ${REQUIRED_IN_PROD.has(name) ? "ya" : "-"} | ${note.replaceAll("|", "\\|")} |`);
    notes = [];
  }
  return rows.join("\n");
}

const USAGE = `# zoomin - panduan pakai

## Quick start

\`\`\`bash
zoomin env > .env          # buat .env awal, isi secret untuk produksi
livekit-server --dev       # LiveKit lokal (devkey/secret, ws://127.0.0.1:7880)
zoomin check               # validasi konfigurasi
zoomin                     # jalankan server, buka http://localhost:3000
\`\`\`

Login memakai akun Google (\`GOOGLE_CLIENT_ID\`/\`GOOGLE_CLIENT_SECRET\`). Email di \`SUPER_ADMIN_EMAILS\` otomatis
menjadi super_admin; angkat admin dari halaman /dev atau \`zoomin user promote <email> --role admin\`.

## Perintah

- \`zoomin [serve]\` jalankan server (default).
- \`zoomin migrate\` terapkan migrasi SQLite lalu keluar.
- \`zoomin check\` validasi konfigurasi; exit 1 bila tidak valid. Secret tidak pernah dicetak.
- \`zoomin user list|promote <email> --role admin|user|unban <email>\` kelola akun darurat langsung di DB.
- \`zoomin env\` cetak contoh \`.env\`.
- \`zoomin --docs <topik>\` dokumentasi; \`zoomin <perintah> --help\` bantuan per perintah.

## Opsi

\`-p/--port\`, \`-H/--host\`, \`--db\` menimpa \`PORT\`, \`HOST\`, \`DB_PATH\` dari env.
\`--env-file <path>\` memuat variabel dari file tersebut. Lihat \`zoomin --docs env\` untuk semua variabel.

## Kode keluar

\`0\` sukses, \`1\` gagal (config tidak valid, server/migrasi error), \`2\` argumen salah.`;

/** Topik dokumentasi → isi. Fungsi agar topik berat (env) baru dihitung saat diminta. */
export const DOCS_TOPICS: Record<string, () => string> = {
  usage: () => USAGE,
  env: () => `# Variabel env\n\n${envTable()}\n\nDi produksi server gagal start bila variabel wajib kosong; BETTER_AUTH_SECRET minimal 32 karakter.`,
  deploy: () => deployReadme,
  api: () => section(readme, "API"),
  readme: () => readme,
  list: () => `Topik dokumentasi (zoomin --docs <topik>):\n${Object.keys(DOCS_TOPICS).map((t) => `  ${t}`).join("\n")}`,
};
