import { describe, it, expect } from "vitest";
import { formatTokens, formatDuration, formatTime } from "../../src/utils/format.js";

describe("formatTokens", () => {
  it("应格式化小于 1000 的数字", () => {
    expect(formatTokens(500)).toBe("500");
  });

  it("应格式化大于 1000 的数字为 K 单位", () => {
    expect(formatTokens(1234)).toBe("1.2K");
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(10000)).toBe("10.0K");
  });
});

describe("formatDuration", () => {
  it("应格式化毫秒", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("应格式化秒", () => {
    expect(formatDuration(1500)).toBe("1.5s");
  });

  it("应格式化分钟和秒", () => {
    expect(formatDuration(65000)).toBe("1m 5s");
  });
});

describe("formatTime", () => {
  it("应格式化日期为 HH:MM", () => {
    const date = new Date("2024-01-15T14:30:00");
    expect(formatTime(date)).toBe("14:30");
  });
});
