import { describe, expect, test } from "bun:test";
import type { SessionUser } from "../shared/api.types";
import { getAllowedEmailDomains } from "./auth.better";
import { listAudit } from "./audit.repository";
import { openDb } from "./db";
import { InvalidSettingsError, getSettings, updateSettings } from "./settings.repository";

const root: SessionUser = { id: "root1", name: "Root", email: "root@example.test", image: null, role: "super_admin" }; // test-only

describe("settings.repository", () => {
  test("default allowedEmailDomains [] ", () => {
    expect(getSettings(openDb(":memory:"))).toEqual({ allowedEmailDomains: [] });
  });

  test("update: trim + huruf kecil, terbaca auth.better (format sama), audit before/after", () => {
    const db = openDb(":memory:");
    expect(updateSettings(db, { allowedEmailDomains: ["  Contoh.ID ", "sub.example.co.uk"] }, root)).toEqual({
      allowedEmailDomains: ["contoh.id", "sub.example.co.uk"],
    });
    expect(getAllowedEmailDomains(db)).toEqual(["contoh.id", "sub.example.co.uk"]);
    updateSettings(db, { allowedEmailDomains: [] }, root);
    expect(getSettings(db)).toEqual({ allowedEmailDomains: [] });
    const entries = listAudit(db, { action: "setting.update" }).items;
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.detail)).toContainEqual({ before: [], after: ["contoh.id", "sub.example.co.uk"] });
    expect(entries[0]).toMatchObject({ actorId: "root1", targetType: "setting", targetId: "allowed_email_domains" });
  });

  test.each([
    [["contoh"], "/allowedEmailDomains/0"],
    [["a.id", "bad domain.id"], "/allowedEmailDomains/1"],
    [["-x.id"], "/allowedEmailDomains/0"],
    [["@contoh.id"], "/allowedEmailDomains/0"],
    [["a.id", "A.ID"], "/allowedEmailDomains/1"],
    [Array.from({ length: 51 }, (_, i) => `d${i}.id`), "/allowedEmailDomains"],
  ])("invalid %p → InvalidSettingsError path %s, tidak tersimpan, tanpa audit", (domains, path) => {
    const db = openDb(":memory:");
    let err: unknown;
    try {
      updateSettings(db, { allowedEmailDomains: domains }, root);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(InvalidSettingsError);
    expect((err as InvalidSettingsError).path).toBe(path);
    expect(getSettings(db)).toEqual({ allowedEmailDomains: [] });
    expect(listAudit(db).items).toEqual([]);
  });
});
