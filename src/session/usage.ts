import type { LLMUsage } from "../types/provider.js";

export interface UsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export class UsageTracker {
  private readonly totals: UsageSnapshot;

  constructor(initial?: Partial<UsageSnapshot>) {
    this.totals = {
      promptTokens: initial?.promptTokens ?? 0,
      completionTokens: initial?.completionTokens ?? 0,
      totalTokens: initial?.totalTokens ?? 0,
      calls: initial?.calls ?? 0,
    };
  }

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

export function formatUsageSnapshot(snapshot: UsageSnapshot, modelName: string): string {
  return [
    "Token usage",
    `Model: ${modelName}`,
    `Prompt tokens: ${snapshot.promptTokens}`,
    `Completion tokens: ${snapshot.completionTokens}`,
    `Total tokens: ${snapshot.totalTokens}`,
    `LLM calls: ${snapshot.calls}`,
  ].join("\n");
}
