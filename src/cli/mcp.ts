import { getGlobalConfigPath, loadConfigFile, writeConfigFile } from "../config/manager.js";
import type { MCPServerConfig } from "../types/config.js";
import { error, info } from "../utils/logger.js";

export interface MCPAddOptions {
  transport?: "stdio" | "sse" | "http";
  env?: string[];
  url?: string;
}

function parseEnvEntries(entries: string[] | undefined): Record<string, string> | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const env: Record<string, string> = {};
  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`无效的环境变量格式: ${entry}`);
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

function loadGlobalConfig() {
  const configPath = getGlobalConfigPath();
  const config = loadConfigFile(configPath);

  return {
    configPath,
    config,
  };
}

export function mcpAdd(
  name: string,
  command: string,
  args: string[] | undefined,
  options: MCPAddOptions,
): void {
  try {
    const { config, configPath } = loadGlobalConfig();
    const mcpServers = config.mcpServers ?? {};
    const serverConfig: MCPServerConfig = {
      command,
      args: args ?? [],
      transport: options.transport ?? "stdio",
      ...(options.url ? { url: options.url } : {}),
      ...(options.env ? { env: parseEnvEntries(options.env) } : {}),
    };

    mcpServers[name] = serverConfig;
    config.mcpServers = mcpServers;

    writeConfigFile(configPath, config);
    info(`MCP 服务已添加: ${name}`);
  } catch (err) {
    error(`添加 MCP 服务失败: ${err}`);
  }
}

export function mcpRemove(name: string): void {
  try {
    const { config, configPath } = loadGlobalConfig();
    const mcpServers = { ...(config.mcpServers ?? {}) };

    if (!(name in mcpServers)) {
      info(`MCP 服务不存在: ${name}`);
      return;
    }

    delete mcpServers[name];
    config.mcpServers = mcpServers;

    writeConfigFile(configPath, config);
    info(`MCP 服务已移除: ${name}`);
  } catch (err) {
    error(`移除 MCP 服务失败: ${err}`);
  }
}

export function mcpList(): void {
  try {
    const { config } = loadGlobalConfig();
    const entries = Object.entries(config.mcpServers ?? {});

    if (entries.length === 0) {
      console.log("未配置 MCP 服务");
      return;
    }

    for (const [name, server] of entries) {
      console.log(
        `${name}  ${server.transport ?? "stdio"}  ${server.command} ${server.args.join(" ")}`.trim(),
      );
    }
  } catch (err) {
    error(`读取 MCP 服务失败: ${err}`);
  }
}
