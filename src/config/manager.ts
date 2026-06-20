/**
 * 配置读写管理器
 *
 * 负责配置文件的读取、写入和路径管理。
 * 支持 JSONC 格式（含注释的 JSON），兼容 Cursor/Cline 配置格式。
 *
 * 配置文件位置：
 *   全局：~/.config/code-agent/config.jsonc
 *   项目：{project_root}/.code-agent.jsonc
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type ParseError, parse } from "jsonc-parser";
import type { Config } from "../types/config.js";

const CONFIG_DIR = join(homedir(), ".config", "code-agent");
const GLOBAL_CONFIG_PATH = join(CONFIG_DIR, "config.jsonc");
const PROJECT_CONFIG_FILENAME = ".code-agent.jsonc";

export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_PATH;
}

export function getProjectConfigPath(cwd: string): string | null {
  const projectPath = join(cwd, PROJECT_CONFIG_FILENAME);
  if (existsSync(projectPath)) {
    return projectPath;
  }
  return null;
}

/** 读取并解析 JSONC 配置文件 */
export function loadConfigFile(filePath: string): Config {
  const content = readFileSync(filePath, "utf-8");
  const errors: ParseError[] = [];
  const result = parse(content, errors) as Config;
  if (errors.length > 0) {
    throw new Error(`配置文件解析错误: ${errors[0].error}`);
  }
  return result ?? {};
}

/** 写入配置文件，自动创建父目录 */
export function writeConfigFile(filePath: string, config: Config): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/** 检查全局配置文件是否存在 */
export function configExists(): boolean {
  return existsSync(GLOBAL_CONFIG_PATH);
}
