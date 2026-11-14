import { describe, expect, it } from "bun:test";
import { AUDIT_ACTION_LABEL, AUDIT_ACTIONS } from "./dev.labels";

describe("AUDIT_ACTION_LABEL", () => {
  it("setiap aksi punya label Indonesia unik dan tidak kosong", () => {
    const labels = AUDIT_ACTIONS.map((a) => AUDIT_ACTION_LABEL[a]);
    expect(AUDIT_ACTIONS).toHaveLength(16);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    expect(AUDIT_ACTION_LABEL["user.role"]).toBe("Ubah peran");
  });
});
