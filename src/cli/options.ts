/**
 * CLI 选项解析
 *
 * 将 Commander 解析的原始选项对象转换为 CLIOptions 类型，
 * 用于传递给配置解析器进行合并。
 */

import type { CLIOptions } from "../config/resolver.js";

export function parseCLIOptions(raw: Record<string, unknown>): CLIOptions {
  return {
    prompt: raw.prompt as string | undefined,
    mode: raw.mode as string | undefined,
    model: raw.model as string | undefined,
    yolo: raw.yolo as boolean | undefined,
    debug: raw.debug as boolean | undefined,
  };
}
