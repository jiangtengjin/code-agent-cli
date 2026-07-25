import { runExecutionLoop } from "../session/execution.js";
import type { PlanState } from "../types/plan.js";
import type { LLMResponse } from "../types/provider.js";
import type { ModeHandler, ModeRunResult, RunContext } from "./handler.js";

type ParsedPlanResponse = {
  summary: string;
  steps: Array<{
    title: string;
    prompt: string;
  }>;
};

const PLAN_SYSTEM_PROMPT = [
  "你处于 Plan 模式。",
  "请先分析用户任务，再输出一个可执行计划。",
  '只返回 JSON，不要输出 Markdown 代码块。格式必须是 {"summary":"...","steps":[{"title":"...","prompt":"..."}]}。',
  "steps 至少 1 个，最多 8 个，每个 prompt 应该能直接交给编码代理执行。",
].join("\n");

function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(trimmed);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Plan mode did not return valid JSON");
}

function parsePlanResponse(response: LLMResponse, originalTask: string): PlanState {
  const parsed = JSON.parse(extractJsonPayload(response.content)) as ParsedPlanResponse;
  if (!parsed.summary || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("Plan mode returned an incomplete plan");
  }

  return {
    originalTask,
    summary: parsed.summary,
    steps: parsed.steps.map((step) => ({
      title: step.title,
      prompt: step.prompt,
      status: "pending" as const,
    })),
  };
}

export function formatPlanState(plan: PlanState): string {
  const lines = [`[PLAN] ${plan.summary}`];
  for (const [index, step] of plan.steps.entries()) {
    const status =
      step.status === "done"
        ? "✓"
        : step.status === "running"
          ? "⏳"
          : step.status === "failed"
            ? "✗"
            : "◻";
    const suffix = step.error ? ` — ${step.error}` : "";
    lines.push(`${index + 1}. ${status} ${step.title}${suffix}`);
  }

  return lines.join("\n");
}

export async function executeApprovedPlan(
  planState: PlanState,
  context: RunContext,
  maxIterations: number,
): Promise<ModeRunResult> {
  let totalIterations = 0;

  for (const step of planState.steps) {
    step.status = "running";
    context.output?.onPlanState?.(planState);

    try {
      const result = await runExecutionLoop(step.prompt, context, maxIterations);
      totalIterations += result.iterations;

      if (result.reachedLimit) {
        step.status = "failed";
        step.error = "Reached max execution steps";
        context.output?.onPlanState?.(planState);
        return {
          iterations: totalIterations,
          reachedLimit: true,
          assistantContent: formatPlanState(planState),
        };
      }

      step.status = "done";
      step.error = undefined;
      context.output?.onPlanState?.(planState);
    } catch (error) {
      step.status = "failed";
      step.error = error instanceof Error ? error.message : String(error);
      context.output?.onPlanState?.(planState);
      return {
        iterations: totalIterations,
        reachedLimit: false,
        assistantContent: formatPlanState(planState),
      };
    }
  }

  const summary = `Plan completed\n${formatPlanState(planState)}`;
  context.messages.push({ role: "assistant", content: summary });
  context.output?.onAssistantMessage?.(summary);

  return {
    iterations: totalIterations,
    reachedLimit: false,
    assistantContent: summary,
  };
}

export class PlanModeHandler implements ModeHandler {
  readonly mode = "plan" as const;
  readonly maxIterations = 20;

  async run(input: string, context: RunContext): Promise<ModeRunResult> {
    context.messages.push({ role: "user", content: input });

    const response = await context.provider.chat({
      messages: [...context.messages],
      systemPrompt: PLAN_SYSTEM_PROMPT,
    });

    context.usageTracker.record(response.usage);
    const costWarning = context.costTracker?.record(response.model, response.usage);
    if (response.usage) {
      context.output?.onTokenUsage?.(response.usage);
    }
    if (costWarning) {
      context.output?.onWarning?.(costWarning);
    }

    const planState = parsePlanResponse(response, input);
    const formattedPlan = `${formatPlanState(planState)}\n\n输入 Y 确认执行，输入 N 取消，或直接输入修改意见。`;
    context.messages.push({ role: "assistant", content: formattedPlan });
    context.output?.onAssistantMessage?.(formattedPlan);
    context.output?.onPlanState?.(planState);

    return {
      iterations: 1,
      reachedLimit: false,
      assistantContent: formattedPlan,
      planState,
    };
  }
}
