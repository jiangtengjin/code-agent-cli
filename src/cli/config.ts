/**
 * code-agent config 命令实现
 *
 * 提供对全局配置文件的增删改查操作：
 *   config set <key> <value>   — 设置配置项（支持点号路径如 model.provider）
 *   config get <key>            — 查看配置项
 *   config list                 — 列出所有配置
 *   config edit                 — 打开编辑器编辑配置文件
 */

import { getGlobalConfigPath, loadConfigFile, writeConfigFile } from "../config/manager.js";
import { error, info } from "../utils/logger.js";

/** 设置配置项，支持点号分隔的嵌套路径 */
export function configSet(key: string, value: string): void {
  try {
    const configPath = getGlobalConfigPath();
    const config = loadConfigFile(configPath);
    const keys = key.split(".");
    let current: Record<string, unknown> = config as Record<string, unknown>;

    // 逐层导航到目标父节点，自动创建中间对象
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== "object") {
        current[keys[i]] = {};
      }
      current = current[keys[i]] as Record<string, unknown>;
    }

    // 设置值（尝试解析 JSON，失败则存为字符串）
    const lastKey = keys[keys.length - 1];
    const parsedValue = tryParseJSON(value);
    current[lastKey] = parsedValue;

    writeConfigFile(configPath, config);
    info(`配置已更新: ${key} = ${value}`);
  } catch (err) {
    error(`设置配置失败: ${err}`);
  }
}

/** 查看配置项，支持点号分隔的嵌套路径 */
export function configGet(key: string): void {
  try {
    const configPath = getGlobalConfigPath();
    const config = loadConfigFile(configPath);
    const keys = key.split(".");
    let current: unknown = config;

    for (const k of keys) {
      if (current && typeof current === "object" && k in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[k];
      } else {
        console.log(`配置未找到: ${key}`);
        return;
      }
    }

    console.log(typeof current === "string" ? current : JSON.stringify(current, null, 2));
  } catch (err) {
    error(`读取配置失败: ${err}`);
  }
}

/** 列出所有配置 */
export function configList(): void {
  try {
    const configPath = getGlobalConfigPath();
    const config = loadConfigFile(configPath);
    console.log(JSON.stringify(config, null, 2));
  } catch (err) {
    error(`读取配置失败: ${err}`);
  }
}

/** 提示用户手动编辑配置文件 */
export function configEdit(): void {
  const configPath = getGlobalConfigPath();
  info(`请手动编辑配置文件: ${configPath}`);
}

/** 尝试将字符串解析为 JSON，失败则返回原字符串 */
function tryParseJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
