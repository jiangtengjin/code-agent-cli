/**
 * 日志工具
 *
 * 统一输出格式：所有日志带有 [code-agent] 前缀，便于识别。
 * debug 日志仅在 --debug 模式下输出。
 */

const PREFIX = "[code-agent]";
let isDebug = false;

export function setDebug(enabled: boolean): void {
  isDebug = enabled;
}

export function debug(...args: unknown[]): void {
  if (isDebug) {
    console.error(PREFIX, "[debug]", ...args);
  }
}

export function info(...args: unknown[]): void {
  console.error(PREFIX, "[info]", ...args);
}

export function warn(...args: unknown[]): void {
  console.error(PREFIX, "[warn]", ...args);
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, "[error]", ...args);
}
