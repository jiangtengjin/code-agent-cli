/**
 * Shell 快捷键定义与分发。
 *
 * 这里把原来散落在 `app.tsx` 的 stdin 按键处理抽成可测试的纯函数：
 * - `normalizeKeyInput` 把原始 stdin chunk 归一成结构化的按键描述。
 * - `dispatchShortcut` 把按键映射成 Shell 应执行的语义动作。
 *
 * 设计要点：
 * - 文本判定不限制为 ASCII，避免 CJK 等多字节输入被静默丢弃。
 * - 分发器只产出「意图」，不直接改状态，便于在组件中统一副作用落地。
 */

export const SHELL_SHORTCUT_HINTS = [
  "Enter submit",
  "Tab complete",
  "Esc clear",
  "/goto <scene>",
] as const;

export type KeyDescriptor =
  | { kind: "escape" }
  | { kind: "enter" }
  | { kind: "tab" }
  | { kind: "backspace" }
  | { kind: "text"; text: string }
  | { kind: "unknown" };

export interface ShortcutContext {
  draft: string;
  hasComposer?: boolean;
}

export type ShortcutResult =
  | { type: "clear-draft" }
  | { type: "submit"; draft: string }
  | { type: "complete"; draft: string }
  | { type: "delete-char" }
  | { type: "insert-char"; text: string }
  | { type: "noop" };

const NOOP: ShortcutResult = { type: "noop" };

function toStringInput(raw: string | Buffer): string {
  return Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
}

/**
 * 判断文本是否可作为 composer 输入。
 *
 * 不限制为 ASCII，只要不含控制字符（U+0000–U+001F、U+007F）即可，
 * 这样 CJK、emoji 等多字节输入都能进入 draft。
 */
export function isPrintableText(text: string): boolean {
  if (text.length === 0) {
    return false;
  }

  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      return false;
    }
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return false;
    }
  }

  return true;
}

export function normalizeKeyInput(raw: string | Buffer): KeyDescriptor {
  const input = toStringInput(raw);

  if (input === "\u001B") {
    return { kind: "escape" };
  }

  if (input === "\r" || input === "\n") {
    return { kind: "enter" };
  }

  if (input === "\t") {
    return { kind: "tab" };
  }

  if (input === "\b" || input === "\u007F") {
    return { kind: "backspace" };
  }

  if (isPrintableText(input)) {
    return { kind: "text", text: input };
  }

  return { kind: "unknown" };
}

export function dispatchShortcut(key: KeyDescriptor, context: ShortcutContext): ShortcutResult {
  switch (key.kind) {
    case "escape":
      return { type: "clear-draft" };

    case "enter": {
      const draft = context.draft.trim();
      if (!draft) {
        return NOOP;
      }
      return { type: "submit", draft };
    }

    case "tab":
      return { type: "complete", draft: context.draft };

    case "backspace":
      if (!context.draft) {
        return NOOP;
      }
      return { type: "delete-char" };

    case "text":
      return { type: "insert-char", text: key.text };

    default:
      return NOOP;
  }
}
