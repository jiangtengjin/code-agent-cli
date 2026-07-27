/**
 * CLI 选项解析
 *
 * 将 Commander 解析的原始选项对象转换为 CLIOptions 类型，
 * 用于传递给配置解析器进行合并。
 */

import type { CLIOptions } from "../config/resolver.js";
import type { ChatMode } from "../types/mode.js";

const CHAT_MODES: ChatMode[] = ["normal", "auto", "plan", "edit"];

function parseChatMode(value: unknown): ChatMode | undefined {
  if (typeof value !== "string") return undefined;
  return CHAT_MODES.includes(value as ChatMode) ? (value as ChatMode) : undefined;
}

export function parseCLIOptions(raw: Record<string, unknown>): CLIOptions {
  const noAltScreen =
    (raw.noAltScreen as boolean | undefined) ?? (raw.altScreen === false ? true : undefined);

  return {
    prompt: raw.prompt as string | undefined,
    continue: raw.continue as boolean | undefined,
    plainUi: raw.plainUi as boolean | undefined,
    noAltScreen,
    mode: parseChatMode(raw.mode),
    model: raw.model as string | undefined,
    yolo: raw.yolo as boolean | undefined,
    debug: raw.debug as boolean | undefined,
  };
}
