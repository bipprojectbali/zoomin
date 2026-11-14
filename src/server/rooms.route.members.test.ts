import { describe, expect, test } from "bun:test";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { type ApiError, CREATE_ROOM_MAX_MEMBERS } from "../shared/api.types";
import { createApi } from "./api";
import { listAudit } from "./audit.repository";
import { ALLOWED_EMAIL_DOMAINS_KEY } from "./auth.better";

const deps = createTestDeps();
const { db } = deps;
const app = createApi(deps);

const admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
const bob = await createTestUser(deps, { email: "bob@example.test", name: "Bob" });

const create = (body: unknown) =>
  app.handle(
    new Request("http://localhost/api/rooms", { method: "POST", headers: { "content-type": "application/json", cookie: admin.cookie }, body: JSON.stringify(body) }),
  );
const count = (sql: string, ...args: string[]) => (db.query(sql).get(...args) as { n: number }).n;

describe("POST /api/rooms dengan members (P5)", () => {
  test("akun ada → anggota, belum ada → pending; email pembuat & duplikat diabaikan; audit ditulis", async () => {
    const res = await create({
      id: "team",
      title: "Tim",
      visibility: "private",
      members: [
        { email: " BOB@example.test ", role: "viewer" },
        { email: "new@example.test", role: "participant" },
        { email: "bob@example.test", role: "host" },
        { email: "ADMIN@example.test", role: "viewer" },
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "team", role: "host", visibility: "private" });
    expect(db.query("SELECT user_id, role FROM room_members WHERE room_id = 'team' ORDER BY role").all()).toEqual([
      { user_id: admin.user.id, role: "host" },
      { user_id: bob.user.id, role: "viewer" },
    ]);
    expect(db.query("SELECT email, role FROM room_invitations WHERE room_id = 'team'").all()).toEqual([
      { email: "new@example.test", role: "participant" },
    ]);
    const audits = listAudit(db, { limit: 100 }).items.filter((e) => e.targetId === "team");
    expect(audits.map((e) => e.action).sort()).toEqual(["room.create", "room.member.add", "room.member.add"]);
    expect(audits.filter((e) => e.action === "room.member.add").map((e) => e.detail.pending).sort()).toEqual([false, true]);
  });

  test("domain di luar allowlist → 400 path /members/<i>/email, tidak ada yang dibuat", async () => {
    db.query("INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)").run(ALLOWED_EMAIL_DOMAINS_KEY, '["example.test"]', Date.now());
    try {
      const res = await create({ id: "blocked", title: "B", members: [{ email: "ok@example.test", role: "viewer" }, { email: "x@other.test", role: "viewer" }] });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "email_domain_not_allowed", path: "/members/1/email" });
    } finally {
      db.query("DELETE FROM app_settings WHERE key = ?").run(ALLOWED_EMAIL_DOMAINS_KEY);
    }
    expect(count("SELECT COUNT(*) AS n FROM rooms WHERE id = 'blocked'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM room_invitations WHERE room_id = 'blocked'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM audit_log WHERE target_id = 'blocked'")).toBe(0);
  });

  test("email tidak valid → 400 invalid_input dengan path index", async () => {
    const res = await create({ id: "bad-email", title: "B", members: [{ email: "nope", role: "viewer" }] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_input", path: "/members/0/email" });
  });

  test(`> ${CREATE_ROOM_MAX_MEMBERS} anggota → 400 invalid_input`, async () => {
    const members = Array.from({ length: CREATE_ROOM_MAX_MEMBERS + 1 }, (_, i) => ({ email: `m${i}@example.test`, role: "viewer" }));
    const res = await create({ id: "too-many", title: "T", members });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiError).code).toBe("invalid_input");
    expect(count("SELECT COUNT(*) AS n FROM rooms WHERE id = 'too-many'")).toBe(0);
  });

  test("anggota gagal disimpan setelah room ter-insert → room, host, anggota & audit ikut rollback", async () => {
    db.run("CREATE TEMP TRIGGER fail_invite BEFORE INSERT ON room_invitations BEGIN SELECT RAISE(ABORT, 'boom'); END");
    try {
      const res = await create({ id: "rollback", title: "R", members: [{ email: "bob@example.test", role: "viewer" }, { email: "ghost@example.test", role: "viewer" }] });
      expect(res.status).toBe(500);
    } finally {
      db.run("DROP TRIGGER fail_invite");
    }
    expect(count("SELECT COUNT(*) AS n FROM rooms WHERE id = 'rollback'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM room_members WHERE room_id = 'rollback'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM audit_log WHERE target_id = 'rollback'")).toBe(0);
  });

  test("gagal di tengah transaksi (id kembar) → anggota pending tidak tersimpan", async () => {
    expect((await create({ id: "twice", title: "T" })).status).toBe(200);
    const res = await create({ id: "twice", title: "T", members: [{ email: "late@example.test", role: "viewer" }] });
    expect(res.status).toBe(409);
    expect(count("SELECT COUNT(*) AS n FROM room_invitations WHERE room_id = 'twice'")).toBe(0);
  });
});
