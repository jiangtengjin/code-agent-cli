import { describe, expect, it } from "vitest";
import { CostTracker, formatCostSnapshot } from "../../../src/llm/cost-tracker.js";

describe("CostTracker", () => {
  it("tracks estimated cost by model and in total", () => {
    const tracker = new CostTracker({
      pricing: {
        "deepseek-coder": {
          inputPerMillion: 2,
          outputPerMillion: 4,
          currency: "¥",
        },
      },
    });

    tracker.record("deepseek-coder", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });

    const snapshot = tracker.snapshot();

    expect(snapshot.totalCost).toBeCloseTo(0.004, 6);
    expect(snapshot.currency).toBe("¥");
    expect(snapshot.byModel["deepseek-coder"]).toMatchObject({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });
    expect(snapshot.byModel["deepseek-coder"]?.cost).toBeCloseTo(0.004, 6);
  });

  it("warns once when the configured budget threshold is crossed", () => {
    const tracker = new CostTracker({
      monthlyBudget: 0.01,
      warnAtPercent: 50,
      pricing: {
        "deepseek-coder": {
          inputPerMillion: 2,
          outputPerMillion: 4,
          currency: "¥",
        },
      },
    });

    const firstWarning = tracker.record("deepseek-coder", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });
    const secondWarning = tracker.record("deepseek-coder", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });

    expect(firstWarning).toBeUndefined();
    expect(secondWarning).toContain("预算");
    expect(tracker.record("deepseek-coder", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    })).toBeUndefined();
  });

  it("formats a stable cost summary", () => {
    const tracker = new CostTracker({
      pricing: {
        "deepseek-coder": {
          inputPerMillion: 2,
          outputPerMillion: 4,
          currency: "¥",
        },
      },
    });

    tracker.record("deepseek-coder", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });

    const summary = formatCostSnapshot(tracker.snapshot());

    expect(summary).toContain("Cost usage");
    expect(summary).toContain("deepseek-coder");
    expect(summary).toContain("¥0.0040");
  });
});
