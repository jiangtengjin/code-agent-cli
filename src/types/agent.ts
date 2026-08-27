/**
 * 子 Agent 类型定义
 *
 * Agent 与 ChatMode 是两条正交的轴：
 *   ChatMode — 用户面向的运行状态，管「给多少自主权」，由用户手动切换
 *   Agent    — 委派目标，管「子任务交给谁」，由主 agent 依据 description 决定
 *
 * 因此 agent 不进入 ChatMode 的类型体系，二者只在 RunContext 层面共享
 * systemPrompt 覆盖与工具集收窄两个机制。
 */

import type { LLMConfig } from "./config.js";

/** Agent 定义来源，同名覆盖时用于排查冲突 */
export type AgentSource = "builtin" | "global" | "project";

/** 子 Agent 定义 */
export interface AgentDefinition {
  /** 唯一标识，同时作为 spawn_agent 的 agent_type 取值 */
  name: string;
  /**
   * 用途描述。
   *
   * 这个字段是载荷性的：它写给主 agent 的模型看，模型据此决定何时委派。
   * 因此措辞应说明「什么场景该派这个 agent」，而非罗列实现细节。
   */
  description: string;
  /** system prompt，来自 markdown 正文 */
  systemPrompt?: string;
  /**
   * 工具白名单。
   *
   * 支持精确名与 `mcp_*` / `mcp_<server>_*` 前缀通配。
   * undefined 表示继承父级全部工具。
   */
  tools?: string[];
  /** 迭代上限 */
  maxIterations: number;
  /** models 别名或完整 LLMConfig，缺省继承父级 provider */
  model?: string | LLMConfig;
  /** 定义来源 */
  source: AgentSource;
}
