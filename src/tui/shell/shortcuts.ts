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
  "Ctrl+. palette",
  "/goto <scene>",
] as const;

export type KeyDescriptor =
  | { kind: "escape" }
  | { kind: "enter" }
  | { kind: "tab" }
  | { kind: "backspace" }
  | { kind: "arrow"; direction: "up" | "down" }
  | { kind: "control"; key: string }
  | { kind: "text"; text: string }
  | { kind: "unknown" };

export interface ShortcutContext {
  draft: string;
  hasComposer?: boolean;
  paletteOpen?: boolean;
  paletteQuery?: string;
}

export type ShortcutResult =
  | { type: "clear-draft" }
  | { type: "submit"; draft: string }
  | { type: "complete"; draft: string }
  | { type: "delete-char" }
  | { type: "insert-char"; text: string }
  | { type: "open-palette" }
  | { type: "palette-move"; direction: "up" | "down" }
  | { type: "palette-submit" }
  | { type: "palette-query"; query: string }
  | { type: "palette-close" }
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

  // 方向键以 ESC 开头，需在单键 ESC 判定之前识别完整序列，否则会被当作清除。
  if (input === "\u001B[A" || input === "\u001BOA") {
    return { kind: "arrow", direction: "up" };
  }
  if (input === "\u001B[B" || input === "\u001BOB") {
    return { kind: "arrow", direction: "down" };
  }

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

  // Ctrl+. 在多数终端发出 0x1E（Record Separator），作为命令面板触发键。
  if (input === "\u001E") {
    return { kind: "control", key: "." };
  }

  if (isPrintableText(input)) {
    return { kind: "text", text: input };
  }

  return { kind: "unknown" };
}

export function dispatchShortcut(key: KeyDescriptor, context: ShortcutContext): ShortcutResult {
  // 命令面板打开时，按键路由到面板操作而非 composer
  if (context.paletteOpen) {
    return dispatchPaletteShortcut(key, context);
  }

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

    case "control":
      if (key.key === ".") {
        return { type: "open-palette" };
      }
      return NOOP;

    case "text":
      return { type: "insert-char", text: key.text };

    default:
      return NOOP;
  }
}

/**
 * 命令面板打开时的按键分发。
 *
 * 此时 composer 输入被挂起，按键专门用于面板导航与查询：
 * - Esc 关闭面板
 * - Up/Down 在列表中移动选择
 * - Enter 提交当前选中项
 * - 可打印文本用于过滤面板查询
 */
function dispatchPaletteShortcut(key: KeyDescriptor, context: ShortcutContext): ShortcutResult {
  switch (key.kind) {
    case "escape":
      return { type: "palette-close" };

    case "arrow":
      return { type: "palette-move", direction: key.direction };

    case "enter":
      return { type: "palette-submit" };

    case "text":
      return { type: "palette-query", query: (context.paletteQuery ?? "") + key.text };

    case "backspace": {
      const currentQuery = context.paletteQuery ?? "";
      if (currentQuery.length > 0) {
        // 在查询模式下，backspace 删除查询字符而不是 composer 草稿
        return { type: "palette-query", query: currentQuery.slice(0, -1) };
      }
      // 查询空时 backscope 关闭面板（类似 composer 中清空的行为）
      return { type: "palette-close" };
    }

    default:
      // 其他按键在面板模式下忽略，避免干扰面板操作
      return NOOP;
  }
}
