/**
 * Shell 快捷键定义与分发。
 *
 * 这里把 stdin 按键处理抽成可测试的纯函数：
 * - `normalizeKeyInput` 把原始 stdin chunk 归一成结构化的按键描述。
 * - `dispatchShortcut` 把按键映射成 Shell 应执行的语义动作。
 *
 * 设计要点：
 * - 文本判定不限制为 ASCII，避免 CJK 等多字节输入被静默丢弃。
 * - 分发器只产出「意图」，不直接改状态，便于在组件中统一副作用落地。
 * - 按键路由有明确优先级：命令面板 > 临时面板 > slash 建议 > composer。
 *   同一时刻只有一层消费按键，避免焦点争抢。
 */

import type { TUIScene } from "../types.js";
import { ROOT_SCENE } from "./router.js";

/**
 * Composer 下方常驻的快捷键提示。
 *
 * 只列真正需要被记住的四个：唤起命令、补全、回退、退出。
 * 其余能力都能从 `/help` 查到，不占用常驻视觉空间。
 */
export const SHELL_SHORTCUT_HINTS = ["/ 命令", "Tab 补全", "Esc 返回", "Ctrl+C 退出"] as const;

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
  /** 当前是否有覆盖在对话之上的临时面板（`/help`、`/status`）。 */
  panelOpen?: boolean;
  /** 当前场景，用于决定 Esc 是否需要退回根场景。 */
  activeScene?: TUIScene;
  /** 当前 slash 建议条数，为 0 时方向键不参与建议导航。 */
  suggestionCount?: number;
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
  | { type: "close-panel" }
  | { type: "scene-back" }
  | { type: "suggestion-move"; direction: "up" | "down" }
  | { type: "suggestion-accept" }
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

/**
 * Esc 的分层回退。
 *
 * 一个键负责「回到上一层」，层级从近到远：
 * 临时面板 -> 草稿 -> 非根场景 -> 无事可做。
 * 这样用户不需要记住每种覆盖层各自的关闭方式。
 */
function dispatchEscape(context: ShortcutContext): ShortcutResult {
  if (context.panelOpen) {
    return { type: "close-panel" };
  }

  if (context.draft) {
    return { type: "clear-draft" };
  }

  if (context.activeScene && context.activeScene !== ROOT_SCENE) {
    return { type: "scene-back" };
  }

  return NOOP;
}

export function dispatchShortcut(key: KeyDescriptor, context: ShortcutContext): ShortcutResult {
  // 命令面板打开时，按键路由到面板操作而非 composer。
  if (context.paletteOpen) {
    return dispatchPaletteShortcut(key, context);
  }

  // 临时面板打开时只接受关闭，其余按键忽略，避免用户在阅读面板时误改草稿。
  if (context.panelOpen) {
    if (key.kind === "escape" || key.kind === "enter") {
      return { type: "close-panel" };
    }
    return NOOP;
  }

  const hasSuggestions = (context.suggestionCount ?? 0) > 0;

  switch (key.kind) {
    case "escape":
      return dispatchEscape(context);

    case "enter": {
      const draft = context.draft.trim();
      if (!draft) {
        return NOOP;
      }
      return { type: "submit", draft };
    }

    case "tab":
      // slash 建议可见时，Tab 采纳当前高亮项；否则回退到前缀补全。
      if (hasSuggestions) {
        return { type: "suggestion-accept" };
      }
      return { type: "complete", draft: context.draft };

    case "arrow":
      if (hasSuggestions) {
        return { type: "suggestion-move", direction: key.direction };
      }
      return NOOP;

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
      // 查询空时 backspace 关闭面板（类似 composer 中清空的行为）
      return { type: "palette-close" };
    }

    default:
      // 其他按键在面板模式下忽略，避免干扰面板操作
      return NOOP;
  }
}
