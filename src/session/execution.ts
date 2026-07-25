import type { ModeRunResult, RunContext } from "../modes/handler.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { LLMMessage, LLMToolCall } from "../types/provider.js";
import type { ToolResult } from "../types/tool.js";
import { formatDuration } from "../utils/format.js";

export type TaskTimingStats = {
  startedAt: number;
  thinkingMs: number;
  toolMs: number;
  toolCalls: number;
  iterations: number;
};

function nowMs(): number {
  return Date.now();
}

function elapsedSince(startedAt: number): number {
  return Math.max(nowMs() - startedAt, 0);
}

export function createTaskTiming(): TaskTimingStats {
  return {
    startedAt: nowMs(),
    thinkingMs: 0,
    toolMs: 0,
    toolCalls: 0,
    iterations: 0,
  };
}

export function formatTaskTiming(stats: TaskTimingStats, finishedAt = nowMs()): string {
  const totalMs = Math.max(finishedAt - stats.startedAt, 0);
  const parts = [
    `total ${formatDuration(totalMs)}`,
    `thinking ${formatDuration(stats.thinkingMs)}`,
  ];

  if (stats.toolCalls > 0) {
    parts.push(`tools ${stats.toolCalls} calls ${formatDuration(stats.toolMs)}`);
  }

  if (stats.iterations > 1) {
    parts.push(`iterations ${stats.iterations}`);
  }

  return `Elapsed: ${parts.join(" | ")}`;
}

function assistantToolCallMessage(content: string, toolCalls: LLMToolCall[]): LLMMessage {
  return {
    role: "assistant",
    content: content || null,
    toolCalls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.args),
      },
    })),
  };
}

async function persistMessages(context: RunContext): Promise<void> {
  await context.onMessagesChanged?.([...context.messages]);
}

async function executeOneToolCall(
  toolCall: LLMToolCall,
  toolRegistry: ToolRegistry,
  context: RunContext,
): Promise<ToolResult> {
  context.timing.toolCalls++;
  const tool = toolRegistry.get(toolCall.name);

  if (!tool) {
    const result = { success: false, error: `Unknown tool: ${toolCall.name}` };
    context.output?.onToolResult?.(toolCall, result, 0);
    return result;
  }

  context.output?.onToolStart?.(toolCall);

  if (tool.requiresConfirm && !context.skipConfirm) {
    const confirmed = await context.confirmToolCall(toolCall);
    if (!confirmed) {
      const result = { success: false, error: "User cancelled" };
      context.output?.onToolResult?.(toolCall, result, 0);
      return result;
    }
  }

  const toolStartedAt = nowMs();
  let elapsedMs = 0;
  try {
    const result = await tool.execute(toolCall.args);
    elapsedMs = elapsedSince(toolStartedAt);
    context.output?.onToolResult?.(toolCall, result, elapsedMs);
    return result;
  } catch (error) {
    elapsedMs = elapsedSince(toolStartedAt);
    const message = error instanceof Error ? error.message : String(error);
    const result = { success: false, error: message };
    context.output?.onToolResult?.(toolCall, result, elapsedMs);
    return result;
  } finally {
    context.timing.toolMs += elapsedMs;
  }
}

export async function executeToolCalls(
  toolCalls: LLMToolCall[],
  context: RunContext,
): Promise<void> {
  for (const toolCall of toolCalls) {
    const result = await executeOneToolCall(toolCall, context.toolRegistry, context);
    context.messages.push({
      role: "tool",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: JSON.stringify(result),
    });
    await persistMessages(context);
  }
}

export async function runExecutionLoop(
  input: string,
  context: RunContext,
  maxIterations: number,
): Promise<ModeRunResult> {
  context.messages.push({ role: "user", content: input });
  await persistMessages(context);

  let assistantContent: string | undefined;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    context.timing.iterations = iteration;
    context.output?.onIteration?.(iteration);

    const thinkingStartedAt = nowMs();
    const response = await context.provider
      .chat({
        messages: [...context.messages],
        systemPrompt: context.config.systemPrompt,
        tools: context.toolRegistry.getToolDefinitions(),
        signal: context.abortSignal,
      })
      .finally(() => {
        context.timing.thinkingMs += elapsedSince(thinkingStartedAt);
      });

    context.usageTracker.record(response.usage);
    const costWarning = context.costTracker?.record(response.model, response.usage);
    if (response.usage) {
      context.output?.onTokenUsage?.(response.usage);
    }
    if (costWarning) {
      context.output?.onWarning?.(costWarning);
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      context.messages.push(assistantToolCallMessage(response.content, response.toolCalls));
      await persistMessages(context);
      await executeToolCalls(response.toolCalls, context);
      continue;
    }

    if (response.content) {
      assistantContent = response.content;
      context.messages.push({ role: "assistant", content: response.content });
      await persistMessages(context);
      context.output?.onAssistantMessage?.(response.content);
    }

    return { iterations: iteration, reachedLimit: false, assistantContent };
  }

  const warning = "Reached max execution steps; the task may be incomplete.";
  context.output?.onWarning?.(warning);
  return { iterations: iteration, reachedLimit: true, assistantContent };
}
