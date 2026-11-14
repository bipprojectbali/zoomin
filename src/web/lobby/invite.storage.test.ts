import { afterEach, expect, spyOn, test } from "bun:test";
import { loadInvites, saveInvites } from "./invite.storage";

const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

function stubStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) },
  });
  return map;
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "sessionStorage", original);
  else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

test("simpan & baca ulang, link kedaluwarsa dibuang", () => {
  stubStorage();
  saveInvites("r1", {
    participant: { url: "http://x/invite/a", expiresAt: 2000 },
    host: { url: "http://x/invite/b", expiresAt: 500 },
  });
  expect(loadInvites("r1", 1000)).toEqual({ participant: { url: "http://x/invite/a", expiresAt: 2000 } });
  expect(loadInvites("r2", 1000)).toEqual({});
});

test("storage rusak/tak tersedia → kosong + warn, tidak melempar", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const map = stubStorage();
  map.set("zm.invites.r1", "{bukan json");
  expect(loadInvites("r1")).toEqual({});
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
  expect(loadInvites("r1")).toEqual({});
  expect(() => saveInvites("r1", {})).not.toThrow();
  expect(warn).toHaveBeenCalledTimes(3);
  warn.mockRestore();
});
