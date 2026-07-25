import { describe, expect, it } from "vitest";
import { UsageTracker, formatUsageSnapshot } from "../../../src/session/usage.js";

describe("UsageTracker", () => {
  it("starts with an empty snapshot", () => {
    const tracker = new UsageTracker();

    expect(tracker.snapshot()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    });
  });

  it("accumulates usage from multiple model responses", () => {
    const tracker = new UsageTracker();

    tracker.record({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    tracker.record({ promptTokens: 3, completionTokens: 7, totalTokens: 10 });

    expect(tracker.snapshot()).toEqual({
      promptTokens: 13,
      completionTokens: 12,
      totalTokens: 25,
      calls: 2,
    });
  });

  it("ignores missing usage without counting a call", () => {
    const tracker = new UsageTracker();

    tracker.record(undefined);

    expect(tracker.snapshot()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    });
  });

  it("formats a stable slash-command usage summary", () => {
    const tracker = new UsageTracker();
    tracker.record({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });

    const summary = formatUsageSnapshot(tracker.snapshot(), "deepseek-coder");

    expect(summary).toBe(
      [
        "Token usage",
        "Model: deepseek-coder",
        "Prompt tokens: 10",
        "Completion tokens: 5",
        "Total tokens: 15",
        "LLM calls: 1",
      ].join("\n"),
    );
  });

  it("restores totals from a persisted snapshot", () => {
    const tracker = new UsageTracker({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      calls: 2,
    });

    tracker.record({ promptTokens: 3, completionTokens: 2, totalTokens: 5 });

    expect(tracker.snapshot()).toEqual({
      promptTokens: 15,
      completionTokens: 10,
      totalTokens: 25,
      calls: 3,
    });
  });

  it("can restore and reset totals after initialization", () => {
    const tracker = new UsageTracker();

    tracker.record({ promptTokens: 9, completionTokens: 1, totalTokens: 10 });
    tracker.restore({
      promptTokens: 4,
      completionTokens: 3,
      totalTokens: 7,
      calls: 2,
    });
    expect(tracker.snapshot()).toEqual({
      promptTokens: 4,
      completionTokens: 3,
      totalTokens: 7,
      calls: 2,
    });

    tracker.reset();
    expect(tracker.snapshot()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    });
  });
});
