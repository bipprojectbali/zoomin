import { describe, expect, test } from "bun:test";
import { openDb } from "./db";
import { AUDIT_PAGE_MAX, listAudit, recordAudit } from "./audit.repository";
import { InvalidCursorError } from "./rooms.repository";

const base = { actorEmail: "a@example.test", targetType: "user" as const, targetId: "t1", detail: { n: 1 } }; // test-only

describe("audit.repository", () => {
  test("recordAudit mengisi id/at dan detail bolak-balik JSON", () => {
    const db = openDb(":memory:");
    const e = recordAudit(db, { ...base, actorId: "a1", action: "user.ban" });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(listAudit(db).items).toEqual([e]);
  });

  test("keyset at,id desc: 7 entri limit 3 → 3 halaman; filter action & actorId", () => {
    const db = openDb(":memory:");
    for (let i = 0; i < 7; i++) recordAudit(db, { ...base, actorId: i % 2 ? "odd" : "even", action: i < 4 ? "user.ban" : "room.delete" });
    // Paksa waktu berbeda + satu kembar agar urutan teruji.
    db.query("UPDATE audit_log SET at = rowid % 5").run();
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = listAudit(db, { limit: 3, cursor });
      ids.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(ids).toEqual(db.query<{ id: string }, []>("SELECT id FROM audit_log ORDER BY at DESC, id DESC").all().map((r) => r.id));
    expect(listAudit(db, { action: "room.delete" }).items).toHaveLength(3);
    expect(listAudit(db, { actorId: "odd", action: "user.ban" }).items).toHaveLength(2);
  });

  test("limit dijepit ke 1..200; cursor rusak → InvalidCursorError", () => {
    const db = openDb(":memory:");
    for (let i = 0; i < 3; i++) recordAudit(db, { ...base, actorId: "a", action: "user.ban" });
    expect(listAudit(db, { limit: 0 }).items).toHaveLength(1);
    expect(AUDIT_PAGE_MAX).toBe(200);
    expect(() => listAudit(db, { cursor: "rusak" })).toThrow(InvalidCursorError);
  });
});
