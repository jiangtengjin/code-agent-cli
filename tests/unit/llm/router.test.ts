import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../../src/llm/router.js";

describe("ModelRouter", () => {
  it("routes code generation tasks to the code model", () => {
    const router = new ModelRouter();

    const result = router.route("请实现一个 JWT 登录功能", {
      model: { provider: "deepseek", model: "fallback", apiKey: "sk-test" },
      models: {
        code: { provider: "deepseek", model: "deepseek-coder", apiKey: "sk-code" },
        reason: { provider: "qwen", model: "qwen-plus", apiKey: "sk-reason" },
        fast: { provider: "deepseek", model: "deepseek-chat", apiKey: "sk-fast" },
      },
    });

    expect(result.model).toBe("deepseek-coder");
  });

  it("routes analysis and debugging tasks to the reason model", () => {
    const router = new ModelRouter();

    const analysisResult = router.route("分析这个项目的核心模块", {
      model: { provider: "deepseek", model: "fallback", apiKey: "sk-test" },
      models: {
        code: { provider: "deepseek", model: "deepseek-coder", apiKey: "sk-code" },
        reason: { provider: "qwen", model: "qwen-plus", apiKey: "sk-reason" },
      },
    });
    const debugResult = router.route("帮我修复这个 bug", {
      model: { provider: "deepseek", model: "fallback", apiKey: "sk-test" },
      models: {
        code: { provider: "deepseek", model: "deepseek-coder", apiKey: "sk-code" },
        reason: { provider: "qwen", model: "qwen-plus", apiKey: "sk-reason" },
      },
    });

    expect(analysisResult.model).toBe("qwen-plus");
    expect(debugResult.model).toBe("qwen-plus");
  });

  it("falls back to the fast model for general chat", () => {
    const router = new ModelRouter();

    const result = router.route("你好，介绍一下这个项目", {
      model: { provider: "deepseek", model: "fallback", apiKey: "sk-test" },
      models: {
        fast: { provider: "deepseek", model: "deepseek-chat", apiKey: "sk-fast" },
      },
    });

    expect(result.model).toBe("deepseek-chat");
  });

  it("falls back to the default model when no matching routed model exists", () => {
    const router = new ModelRouter();

    const result = router.route("分析这个项目的核心模块", {
      model: { provider: "deepseek", model: "fallback", apiKey: "sk-test" },
      models: {
        fast: { provider: "deepseek", model: "deepseek-chat", apiKey: "sk-fast" },
      },
    });

    expect(result.model).toBe("fallback");
  });
});
