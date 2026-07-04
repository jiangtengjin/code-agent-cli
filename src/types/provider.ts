/**
 * LLM Provider 类型定义
 *
 * 定义与大语言模型交互的消息格式、工具调用格式和响应格式。
 * 兼容 OpenAI Chat Completion API 格式，覆盖 90% 国产模型。
 */

/** 消息内容的一部分（支持多模态） */
export interface LLMContentPart {
  type: "text" | "image";
  text?: string;
  image?: string;
}

/** LLM 对话消息 */
export interface LLMMessage {
  /** 消息角色 */
  role: "system" | "user" | "assistant" | "tool";
  /** 消息内容：纯文本或多模态片段数组 */
  content: string | LLMContentPart[] | null;
  /** 工具调用 ID（tool 类型消息回传） */
  toolCallId?: string;
  /** 工具名称（tool 类型消息回传） */
  toolName?: string;
  /** 工具调用列表（assistant 类型消息携带） */
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/** LLM 返回的工具调用指令 */
export interface LLMToolCall {
  /** 工具调用唯一 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  args: Record<string, unknown>;
}

/** Token 使用统计 */
export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** LLM 响应 */
export interface LLMResponse {
  /** 文本回复内容 */
  content: string;
  /** 工具调用列表（如果有） */
  toolCalls?: LLMToolCall[];
  /** Token 使用统计 */
  usage?: LLMUsage;
  /** 实际使用的模型名称 */
  model: string;
}
