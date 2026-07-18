import type { LLMProvider } from "../llm/provider.js";
import type { TaskTimingStats } from "../session/execution.js";
import type { UsageTracker } from "../session/usage.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Config } from "../types/config.js";
import type { ChatMode } from "../types/mode.js";
import type { LLMMessage, LLMToolCall, LLMUsage } from "../types/provider.js";
import type { ToolResult } from "../types/tool.js";

export type ConfirmToolCall = (toolCall: LLMToolCall) => Promise<boolean>;

export interface RunOutput {
  onAssistantMessage?: (content: string) => void;
  onTokenUsage?: (usage: LLMUsage) => void;
  onToolStart?: (toolCall: LLMToolCall) => void;
  onToolResult?: (toolCall: LLMToolCall, result: ToolResult, elapsedMs: number) => void;
  onWarning?: (message: string) => void;
  onIteration?: (iteration: number) => void;
}

export interface RunContext {
  provider: LLMProvider;
  toolRegistry: ToolRegistry;
  messages: LLMMessage[];
  config: Config;
  usageTracker: UsageTracker;
  timing: TaskTimingStats;
  skipConfirm: boolean;
  confirmToolCall: ConfirmToolCall;
  output?: RunOutput;
}

export interface ModeRunResult {
  iterations: number;
  reachedLimit: boolean;
  assistantContent?: string;
}

export interface ModeHandler {
  readonly mode: ChatMode;
  readonly maxIterations: number;
  run(input: string, context: RunContext): Promise<ModeRunResult>;
}
