/** Preferensi tampilan per orang (S11): view + posisi strip orang, disimpan lokal di localStorage `zoomin.view`. */
import { useSyncExternalStore } from "react";

export const STAGE_VIEWS = ["auto", "gallery", "speaker", "content"] as const;
export const STRIP_POSITIONS = ["right", "bottom", "hidden"] as const;
export type StageView = (typeof STAGE_VIEWS)[number];
export type StripPosition = (typeof STRIP_POSITIONS)[number];
export type ViewPrefs = { view: StageView; strip: StripPosition };

export const VIEW_PREFS_KEY = "zoomin.view";
const MOBILE_QUERY = "(max-width: 639px)"; // = breakpoint sm Tailwind

/** Parse nilai tersimpan; field tak dikenal/rusak → default (strip bawah di mobile). */
export function parseViewPrefs(raw: string | null, mobile: boolean): ViewPrefs {
  const fallback: ViewPrefs = { view: "auto", strip: mobile ? "bottom" : "right" };
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as Partial<ViewPrefs>;
    return {
      view: STAGE_VIEWS.includes(v.view as StageView) ? v.view! : fallback.view,
      strip: STRIP_POSITIONS.includes(v.strip as StripPosition) ? v.strip! : fallback.strip,
    };
  } catch {
    return fallback; // nilai rusak di storage = belum diset
  }
}

const listeners = new Set<() => void>();
/** Nilai terakhir yang gagal ditulis ke storage (private mode): berlaku sampai reload. */
let unsaved: string | undefined;
let readWarned = false; // getSnapshot dipanggil tiap render: warn sekali saja

function readRaw(): string | null {
  if (unsaved !== undefined) return unsaved;
  try {
    return localStorage.getItem(VIEW_PREFS_KEY);
  } catch (e) {
    if (!readWarned) console.warn("[view] localStorage tidak bisa dibaca, pakai default", e);
    readWarned = true;
    return null;
  }
}
const isMobile = () => typeof matchMedia === "function" && matchMedia(MOBILE_QUERY).matches;

// getSnapshot wajib stabil: cache per (raw, mobile).
let cache: { raw: string | null; mobile: boolean; prefs: ViewPrefs } | null = null;
function snapshot(): ViewPrefs {
  const raw = readRaw();
  const mobile = isMobile();
  if (!cache || cache.raw !== raw || cache.mobile !== mobile) cache = { raw, mobile, prefs: parseViewPrefs(raw, mobile) };
  return cache.prefs;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Simpan sebagian preferensi; gagal simpan (private mode) → tetap berlaku sampai reload. */
export function setViewPrefs(patch: Partial<ViewPrefs>): void {
  const raw = JSON.stringify({ ...snapshot(), ...patch });
  try {
    localStorage.setItem(VIEW_PREFS_KEY, raw);
  } catch (e) {
    console.warn("[view] localStorage tidak bisa ditulis", e);
    unsaved = raw;
  }
  for (const cb of listeners) cb();
}

export function useViewPrefs(): ViewPrefs {
  return useSyncExternalStore(subscribe, snapshot);
}
