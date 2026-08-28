import type { ChatMode } from "./mode.js";

/**
 * 配置类型定义
 *
 * 配置文件格式为 JSONC（支持注释），兼容 Cursor/Cline 配置格式
 * 配置文件加载优先级：
 *   1. CLI 参数（最高）
 *   2. 环境变量 CODE_AGENT_*
 *   3. 项目级 .code-agent.jsonc
 *   4. 用户级 ~/.config/code-agent/config.jsonc
 */

/** LLM（大语言模型）连接配置 */
export interface LLMConfig {
  /** 模型提供商，如 deepseek / qwen / glm / ollama */
  provider: string;
  /** 具体模型名称，如 deepseek-coder / qwen-plus */
  model: string;
  /** API 密钥，支持环境变量引用 ${VAR_NAME} */
  apiKey?: string;
  /** 自定义 API 端点，通常格式为 https://api.xxx.com/v1 */
  baseUrl?: string;
  /** 单次生成的最大 token 数 */
  maxTokens?: number;
  /** 生成温度 0-2，越低越确定，越高越随机 */
  temperature?: number;
}

/** MCP（Model Context Protocol）服务端配置 */
export interface MCPServerConfig {
  /** 启动命令，如 npx / node / python */
  command: string;
  /** 命令参数 */
  args: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 传输协议：stdio / sse / http */
  transport?: "stdio" | "sse" | "http";
  /** SSE/HTTP 模式的 URL */
  url?: string;
}

/** RAG（检索增强生成）配置 */
export interface RAGConfig {
  enabled?: boolean;
  maxResults?: number;
  chunkSize?: number;
}

/** 终端执行配置 */
export interface TerminalConfig {
  /** 使用的 shell，如 bash / zsh / powershell */
  shell?: string;
  /** 命令超时时间（毫秒） */
  timeout?: number;
}

/** 单个模型的价格，单位为每百万 token */
export interface ModelPricingConfig {
  inputPerMillion: number;
  outputPerMillion: number;
  currency?: string;
}

/** 费用守卫配置 */
export interface CostGuardConfig {
  /** 月预算上限（美元） */
  monthlyBudget?: number;
  /** 达到预算百分比时告警 */
  warnAtPercent?: number;
  /**
   * 自定义模型价格，按模型名索引，覆盖内置价格表。
   *
   * 内置表必然滞后于厂商发布，且 /models 端点不返回价格信息，因此新模型的
   * 价格只能由用户在此补充；未配置时 token 仍会累计，但费用无法估算。
   */
  pricing?: Record<string, ModelPricingConfig>;
}

/** 会话持久化配置 */
export interface SessionsConfig {
  /** 是否启用本地会话持久化 */
  enabled?: boolean;
  /** 会话存储目录 */
  storePath?: string;
  /** 恢复默认作用域 */
  defaultScope?: "workspace";
  /** 是否默认将非交互 prompt 会话纳入恢复列表 */
  includePromptSessions?: boolean;
}

/** 子 Agent 委派配置 */
export interface AgentsConfig {
  /** 是否启用子 agent 委派，关闭时 spawn_agent 工具不注册 */
  enabled?: boolean;
  /** 最大并发子 agent 数。本期串行执行，恒为 1，此字段仅为并行阶段预留 */
  maxConcurrency?: number;
}

/** 根配置对象 */
export interface Config {
  /** JSON Schema 地址，用于编辑器智能提示 */
  $schema?: string;
  /** 默认模型配置 */
  model?: LLMConfig;
  /** 多模型配置，用于模型路由（按任务类型自动选择） */
  models?: Record<string, LLMConfig>;
  /** 默认对话模式：normal / auto / plan / edit */
  mode?: ChatMode;
  /** 自主模式：跳过用户确认，AI 直接执行 */
  yolo?: boolean;
  /** MCP 服务端列表 */
  mcpServers?: Record<string, MCPServerConfig>;
  /** RAG 配置 */
  rag?: RAGConfig;
  /** 终端配置 */
  terminal?: TerminalConfig;
  /** 费用守卫配置 */
  costGuard?: CostGuardConfig;
  /** 会话持久化配置 */
  sessions?: SessionsConfig;
  /** 子 Agent 委派配置 */
  agents?: AgentsConfig;
  /** 自定义系统提示词 */
  systemPrompt?: string;
}
