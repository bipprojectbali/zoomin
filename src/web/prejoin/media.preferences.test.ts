import { describe, expect, spyOn, test } from "bun:test";
import {
  DEFAULT_MEDIA_PREFERENCES,
  loadMediaPreferences,
  MEDIA_PREFERENCES_KEY,
  prejoinSessionKey,
  saveMediaPreferences,
  stashFirstJoinChoices,
  takeFirstJoinChoices,
} from "./media.preferences";

/** Storage in-memory minimal. // test-only */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const throwingStorage = (): Storage =>
  ({
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  }) as unknown as Storage;

describe("media.preferences", () => {
  test("kosong → default mic & kamera mati", () => {
    expect(loadMediaPreferences(memoryStorage())).toEqual({ audioEnabled: false, videoEnabled: false });
  });

  test("JSON rusak → default", () => {
    const s = memoryStorage();
    s.setItem(MEDIA_PREFERENCES_KEY, "{not json");
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect(loadMediaPreferences(s)).toEqual(DEFAULT_MEDIA_PREFERENCES);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("field bertipe salah diabaikan, field valid dipertahankan", () => {
    const s = memoryStorage();
    s.setItem(MEDIA_PREFERENCES_KEY, JSON.stringify({ audioEnabled: "yes", videoEnabled: true, audioDeviceId: 42, videoDeviceId: "cam-1" }));
    expect(loadMediaPreferences(s)).toEqual({ audioEnabled: false, videoEnabled: true, videoDeviceId: "cam-1" });
  });

  test("roundtrip simpan → baca", () => {
    const s = memoryStorage();
    const c = { audioEnabled: true, videoEnabled: false, audioDeviceId: "mic-2", videoDeviceId: "cam-9" };
    saveMediaPreferences(c, s);
    expect(loadMediaPreferences(s)).toEqual(c);
  });

  test("storage melempar → load default, save tidak melempar", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect(loadMediaPreferences(throwingStorage())).toEqual(DEFAULT_MEDIA_PREFERENCES);
    expect(() => saveMediaPreferences({ audioEnabled: true, videoEnabled: true }, throwingStorage())).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test("storage tidak ada → default", () => {
    expect(loadMediaPreferences(undefined)).toEqual(DEFAULT_MEDIA_PREFERENCES);
  });
});

describe("titipan join pertama (sessionStorage)", () => {
  test("key sesuai kontrak RoomPage", () => {
    expect(prejoinSessionKey("r1")).toBe("zoomin:prejoin:r1");
  });

  test("stash → take sekali lalu hilang", () => {
    const s = memoryStorage();
    stashFirstJoinChoices("r1", { audioEnabled: true, videoEnabled: true, videoDeviceId: "cam" }, s);
    expect(JSON.parse(s.getItem("zoomin:prejoin:r1") ?? "null")).toEqual({ audioEnabled: true, videoEnabled: true, videoDeviceId: "cam" });
    expect(takeFirstJoinChoices("r1", s)).toEqual({ audioEnabled: true, videoEnabled: true, videoDeviceId: "cam" });
    expect(takeFirstJoinChoices("r1", s)).toBeNull();
  });

  test("storage melempar → null tanpa crash", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect(takeFirstJoinChoices("r1", throwingStorage())).toBeNull();
    warn.mockRestore();
  });
});
