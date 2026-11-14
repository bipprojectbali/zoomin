/** Shortcut keyboard room (UX-14): Ctrl/⌘+D = mikrofon, Ctrl/⌘+E = kamera, seperti Google Meet. */
import { useEffect, useRef } from "react";

export type ShortcutAction = "mic" | "camera";

const KEYS: Record<string, ShortcutAction> = { d: "mic", e: "camera" };
const KEY_OF: Record<ShortcutAction, string> = { mic: "D", camera: "E" };

/** Bagian KeyboardEvent yang dibaca matcher (memudahkan test tanpa DOM). */
export type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat">;

/** macOS pakai ⌘ (metaKey), platform lain Ctrl. */
export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Aksi untuk kombinasi tombol, atau null bila bukan shortcut room. */
export function matchShortcut(e: KeyLike, mac: boolean): ShortcutAction | null {
  const primary = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!primary || e.altKey || e.shiftKey || e.repeat) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}

/** Fokus di kolom ketik → shortcut diabaikan supaya tidak mencuri input user. */
export function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/** Teks shortcut untuk tooltip, mis. "⌘+D" / "Ctrl+D". */
export function shortcutLabel(action: ShortcutAction, mac: boolean): string {
  return `${mac ? "⌘" : "Ctrl"}+${KEY_OF[action]}`;
}

export const IS_MAC = typeof navigator !== "undefined" && isMacPlatform(navigator.platform || navigator.userAgent);

/** Pasang listener shortcut global selama `enabled`; handler terbaru selalu dipakai. */
export function useRoomShortcuts(handlers: Record<ShortcutAction, () => void>, enabled: boolean) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const action = matchShortcut(e, IS_MAC);
      if (!action || isTypingTarget(e.target as HTMLElement | null)) return;
      // Cegah default browser (Ctrl+D = bookmark, Ctrl+E = search bar).
      e.preventDefault();
      ref.current[action]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
