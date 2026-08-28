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
    expect(
      tracker.record("deepseek-coder", {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      }),
    ).toBeUndefined();
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

describe("CostTracker 未收录模型的处理", () => {
  const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

  it("未知模型仍累计 token，而非静默丢弃", () => {
    // 此前 record() 遇未知模型直接 return，导致 /status 显示 0 用量，
    // 用户误以为没花钱
    const tracker = new CostTracker();

    tracker.record("glm-5.3", usage);

    expect(tracker.snapshot().byModel["glm-5.3"]).toMatchObject({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      cost: 0,
    });
  });

  it("首次遇到未收录模型时告警一次", () => {
    const tracker = new CostTracker();

    const first = tracker.record("glm-5.3", usage);
    const second = tracker.record("glm-5.3", usage);

    expect(first).toContain("glm-5.3");
    expect(first).toContain("无法估算");
    expect(second).toBeUndefined();
  });

  it("配了预算时明确告知预算告警对该模型不生效", () => {
    const withBudget = new CostTracker({ monthlyBudget: 100, warnAtPercent: 80 });
    const withoutBudget = new CostTracker();

    expect(withBudget.record("glm-5.3", usage)).toContain("预算告警对该模型不生效");
    expect(withoutBudget.record("glm-5.3", usage)).not.toContain("预算告警");
  });

  it("每个未收录模型各告警一次", () => {
    const tracker = new CostTracker();

    expect(tracker.record("glm-5.3", usage)).toContain("glm-5.3");
    expect(tracker.record("glm-5.2", usage)).toContain("glm-5.2");
    expect(tracker.record("glm-5.3", usage)).toBeUndefined();
    expect(tracker.hasUnpricedModels()).toBe(true);
  });

  it("未收录模型不影响已收录模型的费用计算", () => {
    const tracker = new CostTracker();

    tracker.record("glm-5.3", usage);
    tracker.record("deepseek-v4-flash", usage);

    const snapshot = tracker.snapshot();
    expect(snapshot.byModel["glm-5.3"].cost).toBe(0);
    expect(snapshot.byModel["deepseek-v4-flash"].cost).toBeGreaterThan(0);
    expect(snapshot.totalCost).toBe(snapshot.byModel["deepseek-v4-flash"].cost);
  });

  it("用户自定义价格可覆盖并使新模型正常计费", () => {
    const tracker = new CostTracker({
      pricing: { "glm-5.3": { inputPerMillion: 6, outputPerMillion: 18, currency: "¥" } },
    });

    const warning = tracker.record("glm-5.3", usage);

    expect(warning).toBeUndefined();
    expect(tracker.hasUnpricedModels()).toBe(false);
    // 1000/1e6*6 + 500/1e6*18 = 0.015
    expect(tracker.snapshot().byModel["glm-5.3"].cost).toBeCloseTo(0.015, 6);
  });

  it("没有 usage 时不产生任何记录", () => {
    const tracker = new CostTracker();

    expect(tracker.record("glm-5.3", undefined)).toBeUndefined();
    expect(tracker.snapshot().byModel).toEqual({});
    expect(tracker.hasUnpricedModels()).toBe(false);
  });
});
