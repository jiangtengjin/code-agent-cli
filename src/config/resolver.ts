/**
 * 配置解析器
 *
 * 负责按优先级合并多来源配置：
 *   CLI 参数 > 环境变量 > 项目配置 > 用户全局配置
 *
 * 优先级高的配置项会覆盖优先级低的同名配置项。
 */

import type { Config, LLMConfig, MCPServerConfig } from "../types/config.js";
import type { ChatMode } from "../types/mode.js";
import { getGlobalConfigPath, getProjectConfigPath, loadConfigFile } from "./manager.js";

/** CLI 命令行选项 */
export interface CLIOptions {
  prompt?: string;
  mode?: ChatMode;
  model?: string;
  yolo?: boolean;
  debug?: boolean;
}

const CHAT_MODES: ChatMode[] = ["normal", "auto", "plan", "edit"];

function parseChatMode(value: string | undefined): ChatMode | undefined {
  if (!value) return undefined;
  return CHAT_MODES.includes(value as ChatMode) ? (value as ChatMode) : undefined;
}

/** 从环境变量 CODE_AGENT_* 加载配置 */
function loadEnvConfig(): Partial<Config> {
  const config: Partial<Config> = {};

  const apiKey = process.env.CODE_AGENT_API_KEY;
  const modelName = process.env.CODE_AGENT_MODEL;
  const provider = process.env.CODE_AGENT_PROVIDER;
  const baseUrl = process.env.CODE_AGENT_BASE_URL;
  const mode = process.env.CODE_AGENT_MODE;
  const yolo = process.env.CODE_AGENT_YOLO;

  if (apiKey || modelName || provider || baseUrl) {
    config.model = {} as LLMConfig;
    if (apiKey) config.model.apiKey = apiKey;
    if (modelName) config.model.model = modelName;
    if (provider) config.model.provider = provider;
    if (baseUrl) config.model.baseUrl = baseUrl;
  }

  config.mode = parseChatMode(mode);
  if (yolo === "true") config.yolo = true;

  return config;
}

/** 深度合并配置对象，后层覆盖前层同名属性 */
function deepMerge(base: Config, ...sources: Partial<Config>[]): Config {
  const result = { ...base };
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source) as (keyof Config)[]) {
      const value = source[key];
      if (value === undefined) continue;

      // 对 model/models/mcpServers 等嵌套对象做浅合并而非完全替换
      if (key === "model" && typeof value === "object" && result.model) {
        result.model = { ...result.model, ...(value as LLMConfig) };
      } else if (key === "model") {
        result.model = value as LLMConfig;
      } else if (key === "models" && typeof value === "object" && result.models) {
        result.models = {
          ...result.models,
          ...(value as Record<string, LLMConfig>),
        };
      } else if (key === "mcpServers" && typeof value === "object" && result.mcpServers) {
        result.mcpServers = {
          ...result.mcpServers,
          ...(value as Record<string, MCPServerConfig>),
        };
      } else {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}

export class ConfigResolver {
  /** 解析并合并所有来源的配置，返回最终配置 */
  async resolve(cliOptions: CLIOptions): Promise<Config> {
    const cwd = process.cwd();

    // 1. 用户全局配置 ~/.config/code-agent/config.jsonc
    let userConfig: Config = {};
    const globalPath = getGlobalConfigPath();
    try {
      userConfig = loadConfigFile(globalPath);
    } catch {
      // 首次使用可能没有全局配置
    }

    // 2. 项目级配置 .code-agent.jsonc
    let projectConfig: Config = {};
    const projectPath = getProjectConfigPath(cwd);
    if (projectPath) {
      try {
        projectConfig = loadConfigFile(projectPath);
      } catch {
        // 项目配置损坏时忽略
      }
    }

    // 3. 环境变量
    const envConfig = loadEnvConfig();

    // 4. 按优先级合并（后层覆盖前层）
    const merged = deepMerge(
      userConfig,
      projectConfig,
      envConfig,
      this.cliOptionsToConfig(cliOptions),
    );

    return merged;
  }

  /** 将 CLI 选项转换为配置对象 */
  private cliOptionsToConfig(options: CLIOptions): Partial<Config> {
    const config: Partial<Config> = {};
    config.mode = options.mode;
    if (options.model) {
      config.model = { model: options.model } as LLMConfig;
    }
    if (options.yolo) config.yolo = true;
    return config;
  }
}
