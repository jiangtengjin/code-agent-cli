import { describe, expect, it } from "vitest";
import { CostTracker, formatCostSnapshot } from "../../../src/llm/cost-tracker.js";

describe("CostTracker", () => {
  it("tracks DeepSeek V4 Flash with built-in pricing", () => {
    const tracker = new CostTracker();

    tracker.record("deepseek-v4-flash", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });

    const snapshot = tracker.snapshot();

    expect(snapshot.totalCost).toBeCloseTo(0.002, 6);
    expect(snapshot.byModel["deepseek-v4-flash"]).toMatchObject({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });
    expect(snapshot.byModel["deepseek-v4-flash"]?.cost).toBeCloseTo(0.002, 6);
  });

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

  it("restores persisted totals before tracking new usage", () => {
    const tracker = new CostTracker(
      {
        pricing: {
          "deepseek-coder": {
            inputPerMillion: 2,
            outputPerMillion: 4,
            currency: "¥",
          },
        },
      },
      {
        currency: "¥",
        totalCost: 0.004,
        byModel: {
          "deepseek-coder": {
            promptTokens: 1000,
            completionTokens: 500,
            totalTokens: 1500,
            cost: 0.004,
          },
        },
      },
    );

    tracker.record("deepseek-coder", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });

    expect(tracker.snapshot()).toMatchObject({
      currency: "¥",
      totalCost: 0.008,
    });
    expect(tracker.snapshot().byModel["deepseek-coder"]).toMatchObject({
      promptTokens: 2000,
      completionTokens: 1000,
      totalTokens: 3000,
      cost: 0.008,
    });
  });

  it("can restore and reset totals after initialization", () => {
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
    tracker.restore({
      currency: "¥",
      totalCost: 0.004,
      byModel: {
        "deepseek-coder": {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
          cost: 0.004,
        },
      },
    });

    expect(tracker.snapshot()).toMatchObject({
      currency: "¥",
      totalCost: 0.004,
    });

    tracker.reset();
    expect(tracker.snapshot()).toEqual({
      currency: "¥",
      totalCost: 0,
      byModel: {},
    });
  });
});
