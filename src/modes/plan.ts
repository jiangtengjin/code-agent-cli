import { parse } from "jsonc-parser";
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
  "You are in plan mode.",
  "Analyze the user's task and return an actionable execution plan.",
  'Return only a JSON object in this exact shape: {"summary":"...","steps":[{"title":"...","prompt":"..."}]}.',
  "Do not use markdown fences, comments, or trailing explanations.",
  "Use 1 to 8 steps. Each prompt must be directly executable by the coding agent.",
].join("\n");

const PLAN_PREFIX_REGEX =
  /^(?:\[plan\]\s*|plan[:：]\s*|here is the plan[:：]?\s*|plan summary[:：]?\s*|steps[:：]\s*|以下是(?:执行)?计划[:：]?\s*|下面是(?:执行)?计划[:：]?\s*|计划如下[:：]?\s*|我会按以下步骤(?:执行|分析)?[:：]?\s*)/iu;
const LIST_MARKER_REGEX =
  /^\s*(?:[-*+]\s+|\d{1,2}[.)、]\s+|step\s*\d+\s*[:.)-]?\s+|[一二三四五六七八九十]+[、.)]\s+|第\s*[0-9一二三四五六七八九十]+\s*(?:步|阶段)[：:、.\s-]*)/iu;
const INLINE_STEP_BREAK_REGEX =
  /([。；;])\s*(?=(?:第\s*[0-9一二三四五六七八九十]+\s*(?:步|阶段)|step\s*\d+\s*[:.)-]?\s+|\d{1,2}[.)、]\s+))/giu;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanupPrompt(text: string): string {
  return normalizeWhitespace(text.replace(/^[\s"'`]+|[\s"'`]+$/g, ""));
}

function cleanupTitle(text: string): string {
  return cleanupPrompt(text)
    .replace(/[。．.;；:：]+$/u, "")
    .trim();
}

function cleanupSummary(text: string): string {
  return cleanupPrompt(text).replace(PLAN_PREFIX_REGEX, "").trim();
}

function defaultSummary(originalTask: string, stepsCount: number): string {
  const normalizedTask = cleanupPrompt(originalTask);
  if (normalizedTask) {
    return `Plan for: ${normalizedTask}`;
  }

  return `Generated ${stepsCount} plan steps`;
}

function stripCodeFences(content: string): string {
  return content
    .replace(/```(?:jsonc?|javascript|js|markdown)?\s*/giu, "")
    .replace(/```/g, "")
    .trim();
}

function extractJsonPayload(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = /```(?:jsonc?|javascript|js)?\s*([\s\S]+?)\s*```/iu.exec(trimmed);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
}

function getFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && cleanupPrompt(value)) {
      return value;
    }
  }

  return undefined;
}

function deriveStepTitle(prompt: string): string {
  const normalized = cleanupPrompt(prompt);
  const colonMatch = /^(.{3,80}?)[：:]\s+.+$/u.exec(normalized);
  if (colonMatch) {
    return cleanupTitle(colonMatch[1]);
  }

  const dashMatch = /^(.{3,80}?)\s[-–—]\s+.+$/u.exec(normalized);
  if (dashMatch) {
    return cleanupTitle(dashMatch[1]);
  }

  return cleanupTitle(normalized);
}

function normalizePlanStep(value: unknown): { title: string; prompt: string } | null {
  if (typeof value === "string") {
    const prompt = cleanupPrompt(value);
    if (!prompt) {
      return null;
    }

    return {
      title: deriveStepTitle(prompt),
      prompt,
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const promptCandidate =
    getFirstString(record, ["prompt", "task", "instruction", "description", "title", "name"]) ?? "";
  const prompt = cleanupPrompt(promptCandidate);
  if (!prompt) {
    return null;
  }

  const titleCandidate =
    getFirstString(record, ["title", "name", "step", "task", "summary"]) ?? prompt;

  return {
    title: cleanupTitle(titleCandidate) || deriveStepTitle(prompt),
    prompt,
  };
}

function normalizeParsedPlan(value: unknown, originalTask: string): ParsedPlanResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const stepsSource = Array.isArray(record.steps)
    ? record.steps
    : Array.isArray(record.plan)
      ? record.plan
      : null;

  if (!stepsSource || stepsSource.length === 0) {
    return null;
  }

  const steps = stepsSource
    .map((step) => normalizePlanStep(step))
    .filter((step): step is { title: string; prompt: string } => step !== null)
    .slice(0, 8);

  if (steps.length === 0) {
    return null;
  }

  const summaryCandidate =
    getFirstString(record, ["summary", "title", "goal", "description"]) ?? "";

  return {
    summary: cleanupSummary(summaryCandidate) || defaultSummary(originalTask, steps.length),
    steps,
  };
}

function tryParseStructuredPlan(content: string, originalTask: string): ParsedPlanResponse | null {
  const payload = extractJsonPayload(content);
  if (!payload) {
    return null;
  }

  return normalizeParsedPlan(parse(payload), originalTask);
}

function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER_REGEX, "").trim();
}

function isStepLine(line: string): boolean {
  return LIST_MARKER_REGEX.test(line);
}

function parseNaturalLanguagePlan(
  content: string,
  originalTask: string,
): ParsedPlanResponse | null {
  const normalized = stripCodeFences(content)
    .replace(/\r\n?/g, "\n")
    .replace(INLINE_STEP_BREAK_REGEX, "$1\n");

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\[PLAN\]\s*/iu, ""));

  if (lines.length === 0) {
    return null;
  }

  const summaryLines: string[] = [];
  const stepBlocks: string[] = [];
  let currentStep: string[] = [];
  let seenStep = false;

  for (const line of lines) {
    if (isStepLine(line)) {
      seenStep = true;
      if (currentStep.length > 0) {
        stepBlocks.push(normalizeWhitespace(currentStep.join(" ")));
      }
      currentStep = [stripListMarker(line)];
      continue;
    }

    if (!seenStep) {
      summaryLines.push(line);
      continue;
    }

    currentStep.push(line);
  }

  if (currentStep.length > 0) {
    stepBlocks.push(normalizeWhitespace(currentStep.join(" ")));
  }

  const steps = stepBlocks
    .map((block) => cleanupPrompt(block))
    .filter(Boolean)
    .slice(0, 8)
    .map((prompt) => ({
      title: deriveStepTitle(prompt),
      prompt,
    }));

  if (steps.length === 0) {
    return null;
  }

  const summary = cleanupSummary(summaryLines.join(" "));

  return {
    summary: summary || defaultSummary(originalTask, steps.length),
    steps,
  };
}

function parsePlanResponse(response: LLMResponse, originalTask: string): PlanState {
  const parsed =
    tryParseStructuredPlan(response.content, originalTask) ??
    parseNaturalLanguagePlan(response.content, originalTask);

  if (!parsed || !parsed.summary || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
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
        ? "[done]"
        : step.status === "running"
          ? "[running]"
          : step.status === "failed"
            ? "[failed]"
            : "[pending]";
    const suffix = step.error ? ` - ${step.error}` : "";
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
    const formattedPlan = `${formatPlanState(planState)}\n\nEnter Y to execute, N to cancel, or provide feedback to revise the plan.`;
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
