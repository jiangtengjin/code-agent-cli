/**
 * 格式化工具
 *
 * 用于在 TUI 和日志中统一展示 Token 计数、耗时、费用等数据。
 */

/** Token 数格式化：1234 → "1.2K" */
export function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return String(count);
}

/** 耗时格式化：1500ms → "1.5s" */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** 费用格式化：0.1234 → "¥0.1234"，0.12 → "¥0.12" */
export function formatCost(cost: number, currency = "¥"): string {
  if (cost < 0.01) {
    return `${currency}${cost.toFixed(4)}`;
  }
  return `${currency}${cost.toFixed(2)}`;
}

/** 日期格式化：Date → "14:30" */
export function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
