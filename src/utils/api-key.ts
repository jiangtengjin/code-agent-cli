/**
 * API Key 安全工具
 *
 * 提供 API Key 的掩码显示和格式校验功能
 */

/** 掩码 API Key：保留前 4 和后 4 字符，中间替换为 **** */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}*****${key.slice(-4)}`;
}

/** 校验 API Key 是否非空 */
export function isValidApiKey(key: string): boolean {
  return key.length > 0;
}
