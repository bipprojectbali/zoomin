import type { Database } from "bun:sqlite";
import type { AuditAction, AuditEntry, Page } from "../shared/api.types";
import { InvalidCursorError } from "./rooms.repository";

/** Default dan batas atas `limit` daftar audit (GET /api/dev/audit). */
export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 200;

type Row = { id: string; at: number; actor_id: string; actor_email: string; action: AuditAction; target_type: AuditEntry["targetType"]; target_id: string; detail_json: string };

// Cursor opaque: base64url("at,id"); id = UUID (tanpa koma), jadi koma pertama aman sebagai pemisah.
const encodeCursor = (e: Pick<AuditEntry, "at" | "id">) => Buffer.from(`${e.at},${e.id}`).toString("base64url");

function decodeCursor(cursor: string): { at: number; id: string } {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const comma = raw.indexOf(",");
  const at = Number(raw.slice(0, comma));
  const id = raw.slice(comma + 1);
  if (comma <= 0 || !Number.isSafeInteger(at) || !id) throw new InvalidCursorError(`listAudit: invalid cursor (${JSON.stringify(cursor)})`);
  return { at, id };
}

const toEntry = (r: Row): AuditEntry => ({
  id: r.id,
  at: r.at,
  actorId: r.actor_id,
  actorEmail: r.actor_email,
  action: r.action,
  targetType: r.target_type,
  targetId: r.target_id,
  detail: JSON.parse(r.detail_json) as Record<string, unknown>,
});

/** Catat satu aksi admin/dev (A8); id & waktu dibuat di sini. */
export function recordAudit(db: Database, entry: Omit<AuditEntry, "id" | "at">): AuditEntry {
  const full: AuditEntry = { ...entry, id: crypto.randomUUID(), at: Date.now() };
  db.query(
    "INSERT INTO audit_log (id, at, actor_id, actor_email, action, target_type, target_id, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(full.id, full.at, full.actorId, full.actorEmail, full.action, full.targetType, full.targetId, JSON.stringify(full.detail));
  return full;
}

/** Satu halaman audit terbaru dulu (keyset at,id), opsional filter aksi/pelaku. Cursor rusak → InvalidCursorError. */
export function listAudit(
  db: Database,
  opts: { action?: AuditAction; actorId?: string; limit?: number; cursor?: string } = {},
): Page<AuditEntry> {
  const limit = Math.min(Math.max(opts.limit ?? AUDIT_PAGE_DEFAULT, 1), AUDIT_PAGE_MAX);
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  const rows = db
    .query<Row, [string | null, string | null, number | null, string | null, number]>(
      `SELECT * FROM audit_log
       WHERE (?1 IS NULL OR action = ?1) AND (?2 IS NULL OR actor_id = ?2)
         AND (?3 IS NULL OR at < ?3 OR (at = ?3 AND id < ?4))
       ORDER BY at DESC, id DESC LIMIT ?5`,
    )
    .all(opts.action ?? null, opts.actorId ?? null, after?.at ?? null, after?.id ?? null, limit + 1);
  const items = rows.slice(0, limit).map(toEntry);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}
