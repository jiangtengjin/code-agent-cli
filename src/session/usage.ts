import type { LLMUsage } from "../types/provider.js";

export interface UsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export class UsageTracker {
  private readonly totals: UsageSnapshot = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    calls: 0,
  };

  record(usage: LLMUsage | undefined): void {
    if (!usage) return;

    this.totals.promptTokens += usage.promptTokens;
    this.totals.completionTokens += usage.completionTokens;
    this.totals.totalTokens += usage.totalTokens;
    this.totals.calls += 1;
  }

  snapshot(): UsageSnapshot {
    return { ...this.totals };
  }
}

export function formatUsageSnapshot(
  snapshot: UsageSnapshot,
  modelName: string,
): string {
  return [
    "Token usage",
    `Model: ${modelName}`,
    `Prompt tokens: ${snapshot.promptTokens}`,
    `Completion tokens: ${snapshot.completionTokens}`,
    `Total tokens: ${snapshot.totalTokens}`,
    `LLM calls: ${snapshot.calls}`,
  ].join("\n");
}
