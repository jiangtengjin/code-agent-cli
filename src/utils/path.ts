/**
 * 路径安全工具
 *
 * 用于检测文件路径是否敏感，防止 AI 误操作关键系统文件。
 * 敏感文件操作需要额外的用户二次确认。
 */

import micromatch from "micromatch";

/** 敏感文件/目录匹配模式 */
const SENSITIVE_PATTERNS = [
  "**/.env*",
  "**/config*.json",
  "**/config*.yaml",
  "**/*.pem",
  "**/*.key",
  "**/*-secret*",
  "**/credentials*",
  "**/.ssh/**",
  "**/.aws/**",
  "**/node_modules/**",
];

/** 判断路径是否为敏感文件 */
export function isSensitivePath(filePath: string): boolean {
  return micromatch.isMatch(filePath, SENSITIVE_PATTERNS);
}

/** 判断路径是否需要二次确认（目前复用敏感文件检测逻辑） */
export function requiresExtraConfirm(filePath: string): boolean {
  return isSensitivePath(filePath);
}
