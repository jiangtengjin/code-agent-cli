import type { LLMMessage, LLMResponse } from "../types/provider.js";
import type { ToolDefinition } from "../types/tool.js";

export interface ChatParams {
  messages: LLMMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly name: string;
  chat(params: ChatParams): Promise<LLMResponse>;
}
