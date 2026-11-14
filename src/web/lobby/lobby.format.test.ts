import { expect, test } from "bun:test";
import { slugifyRoomId } from "../../shared/room.id";
import { formatDateTime, withStableSuffix } from "./lobby.format";

test("formatDateTime memakai locale id-ID", () => {
  const out = formatDateTime(Date.UTC(2026, 10, 17, 5, 50));
  expect(out).toContain("2026");
  expect(out).toMatch(/Nov/);
  expect(out).not.toMatch(/AM|PM/);
});

test("withStableSuffix: sufiks tetap walau slugifyRoomId acak", () => {
  expect(withStableSuffix(slugifyRoomId("Rapat Desain"), "ab12")).toBe("rapat-desain-ab12");
  expect(withStableSuffix(slugifyRoomId("Rapat Desain"), "ab12")).toBe("rapat-desain-ab12");
  expect(withStableSuffix(slugifyRoomId("!!!"), "ab12")).toBe("ab12");
  expect(withStableSuffix(slugifyRoomId(""), "ab12")).toBe("ab12");
});
