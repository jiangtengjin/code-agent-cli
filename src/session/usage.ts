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
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    };
    this.restore(initial);
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

  /**
   * 把另一份统计并入当前统计。
   *
   * 子 agent 用独立 tracker 计量，结束后并回父级，从而既能单独报告子任务开销，
   * 又不丢失全局总量。
   */
  merge(snapshot: UsageSnapshot): void {
    this.totals.promptTokens += snapshot.promptTokens;
    this.totals.completionTokens += snapshot.completionTokens;
    this.totals.totalTokens += snapshot.totalTokens;
    this.totals.calls += snapshot.calls;
  }

  restore(snapshot?: Partial<UsageSnapshot>): void {
    this.totals.promptTokens = snapshot?.promptTokens ?? 0;
    this.totals.completionTokens = snapshot?.completionTokens ?? 0;
    this.totals.totalTokens = snapshot?.totalTokens ?? 0;
    this.totals.calls = snapshot?.calls ?? 0;
  }

  reset(): void {
    this.restore();
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
