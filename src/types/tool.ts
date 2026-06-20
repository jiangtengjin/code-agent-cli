/**
 * 工具系统类型定义
 *
 * 工具是 AI 与外部世界交互的桥梁，每个工具包含定义（给 LLM 看）
 * 和执行逻辑（实际干活的函数）。
 */

/** 工具定义 — 注册到 LLM 的 function calling 描述 */
export interface ToolDefinition {
  /** 工具名称，LLM 通过此名称调用 */
  name: string;
  /** 工具描述，LLM 根据描述决定是否使用该工具 */
  description: string;
  /** 参数 JSON Schema，描述 LLM 应填写的参数格式 */
  parameters: Record<string, unknown>;
  /** 执行前是否需要用户确认（如写文件/删文件等危险操作） */
  requiresConfirm?: boolean;
  /** 实际执行函数 */
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/** 工具执行结果 */
export interface ToolResult {
  /** 是否执行成功 */
  success: boolean;
  /** 执行返回的数据 */
  data?: unknown;
  /** 错误信息 */
  error?: string;
  /** 是否需要进一步用户确认 */
  requiresConfirm?: boolean;
}
