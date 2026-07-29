import { describe, expect, it } from "vitest";
import {
  SHELL_SHORTCUT_HINTS,
  type ShortcutContext,
  dispatchShortcut,
  isPrintableText,
  normalizeKeyInput,
} from "../../../../src/tui/shell/shortcuts.js";

describe("normalizeKeyInput", () => {
  it("recognizes the escape key", () => {
    expect(normalizeKeyInput("\u001B")).toEqual({ kind: "escape" });
  });

  it("recognizes both carriage return and line feed as enter", () => {
    expect(normalizeKeyInput("\r")).toEqual({ kind: "enter" });
    expect(normalizeKeyInput("\n")).toEqual({ kind: "enter" });
  });

  it("recognizes the tab key", () => {
    expect(normalizeKeyInput("\t")).toEqual({ kind: "tab" });
  });

  it("recognizes both backspace encodings", () => {
    expect(normalizeKeyInput("\b")).toEqual({ kind: "backspace" });
    expect(normalizeKeyInput("\u007F")).toEqual({ kind: "backspace" });
  });

  it("keeps printable ASCII text as a text token", () => {
    expect(normalizeKeyInput("hello")).toEqual({ kind: "text", text: "hello" });
    expect(normalizeKeyInput("/goto")).toEqual({ kind: "text", text: "/goto" });
  });

  it("keeps multi-byte CJK text instead of silently dropping it", () => {
    expect(normalizeKeyInput("你好")).toEqual({ kind: "text", text: "你好" });
    expect(normalizeKeyInput("统一 tui")).toEqual({ kind: "text", text: "统一 tui" });
  });

  it("treats control characters that are not mapped keys as unknown", () => {
    expect(normalizeKeyInput("\u0000")).toEqual({ kind: "unknown" });
    expect(normalizeKeyInput("\u0001")).toEqual({ kind: "unknown" });
  });

  it("accepts buffers by decoding them as utf-8", () => {
    const buffer = Buffer.from("你好", "utf8");
    expect(normalizeKeyInput(buffer)).toEqual({ kind: "text", text: "你好" });
  });
});

describe("isPrintableText", () => {
  it("accepts ASCII text", () => {
    expect(isPrintableText("hello")).toBe(true);
  });

  it("accepts mixed CJK and ASCII text", () => {
    expect(isPrintableText("统一 shell")).toBe(true);
  });

  it("rejects control characters", () => {
    expect(isPrintableText("\u0001")).toBe(false);
    expect(isPrintableText("a\u0001b")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isPrintableText("")).toBe(false);
  });
});

describe("dispatchShortcut", () => {
  const baseContext: ShortcutContext = {
    draft: "",
    hasComposer: true,
  };

  it("clears the draft on escape", () => {
    expect(dispatchShortcut(normalizeKeyInput("\u001B"), baseContext)).toEqual({
      type: "clear-draft",
    });
  });

  it("submits a non-empty draft on enter", () => {
    expect(
      dispatchShortcut(normalizeKeyInput("\r"), { ...baseContext, draft: "/goto chat" }),
    ).toEqual({ type: "submit", draft: "/goto chat" });
  });

  it("ignores enter when the draft is empty", () => {
    expect(dispatchShortcut(normalizeKeyInput("\r"), baseContext)).toEqual({ type: "noop" });
  });

  it("requests completion on tab", () => {
    expect(
      dispatchShortcut(normalizeKeyInput("\t"), { ...baseContext, draft: "/goto ch" }),
    ).toEqual({
      type: "complete",
      draft: "/goto ch",
    });
  });

  it("deletes the last character on backspace", () => {
    expect(dispatchShortcut(normalizeKeyInput("\b"), { ...baseContext, draft: "hello" })).toEqual({
      type: "delete-char",
    });
  });

  it("is a noop on backspace when the draft is empty", () => {
    expect(dispatchShortcut(normalizeKeyInput("\b"), baseContext)).toEqual({ type: "noop" });
  });

  it("inserts printable text into the draft", () => {
    expect(dispatchShortcut(normalizeKeyInput("tui"), baseContext)).toEqual({
      type: "insert-char",
      text: "tui",
    });
  });

  it("inserts CJK text into the draft", () => {
    expect(dispatchShortcut(normalizeKeyInput("你好"), baseContext)).toEqual({
      type: "insert-char",
      text: "你好",
    });
  });

  it("is a noop for unknown control input", () => {
    expect(dispatchShortcut(normalizeKeyInput("\u0001"), baseContext)).toEqual({ type: "noop" });
  });

  it("exposes shortcut hints for the rail", () => {
    expect(SHELL_SHORTCUT_HINTS.length).toBeGreaterThan(0);
    for (const hint of SHELL_SHORTCUT_HINTS) {
      expect(typeof hint).toBe("string");
    }
  });
});
