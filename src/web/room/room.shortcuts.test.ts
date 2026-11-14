import { describe, expect, test } from "bun:test";
import { isMacPlatform, isTypingTarget, matchShortcut, shortcutLabel, type KeyLike } from "./room.shortcuts";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...mods,
});

describe("matchShortcut", () => {
  test("Ctrl+D / Ctrl+E di non-Mac", () => {
    expect(matchShortcut(key("d", { ctrlKey: true }), false)).toBe("mic");
    expect(matchShortcut(key("E", { ctrlKey: true }), false)).toBe("camera");
  });

  test("⌘+D / ⌘+E di Mac; Ctrl di Mac bukan shortcut", () => {
    expect(matchShortcut(key("d", { metaKey: true }), true)).toBe("mic");
    expect(matchShortcut(key("e", { metaKey: true }), true)).toBe("camera");
    expect(matchShortcut(key("d", { ctrlKey: true }), true)).toBeNull();
  });

  test("tanpa modifier, modifier ekstra, repeat, atau tombol lain → null", () => {
    expect(matchShortcut(key("d"), false)).toBeNull();
    expect(matchShortcut(key("d", { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(matchShortcut(key("d", { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(matchShortcut(key("d", { ctrlKey: true, metaKey: true }), false)).toBeNull();
    expect(matchShortcut(key("d", { ctrlKey: true, repeat: true }), false)).toBeNull();
    expect(matchShortcut(key("x", { ctrlKey: true }), false)).toBeNull();
  });
});

test("isTypingTarget: input/textarea/select/contenteditable diabaikan", () => {
  expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
  expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
  expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
  expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
  expect(isTypingTarget(null)).toBe(false);
});

test("isMacPlatform & shortcutLabel", () => {
  expect(isMacPlatform("MacIntel")).toBe(true);
  expect(isMacPlatform("iPhone")).toBe(true);
  expect(isMacPlatform("Win32")).toBe(false);
  expect(shortcutLabel("mic", true)).toBe("⌘+D");
  expect(shortcutLabel("camera", false)).toBe("Ctrl+E");
});
