import { describe, expect, it } from "vitest";
import { getDefaultBaseUrlForProvider } from "../../../src/config/wizard.js";
import { createProviderForModelConfig } from "../../../src/llm/provider-factory.js";

describe("createProviderForModelConfig", () => {
  it("rejects a config without a model", () => {
    expect(() => createProviderForModelConfig({ provider: "glm", model: "" })).toThrow(
      "Model not configured",
    );
  });

  it("requires an API key for hosted providers", () => {
    expect(() => createProviderForModelConfig({ provider: "glm", model: "glm-4.6" })).toThrow(
      "API Key not configured",
    );
  });

  it("allows ollama without an API key since it runs locally", () => {
    const provider = createProviderForModelConfig({
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    });

    expect(provider.name).toBe("openai-compatible");
  });

  it("builds a provider for a known vendor", () => {
    const provider = createProviderForModelConfig({
      provider: "glm",
      model: "glm-4.6",
      apiKey: "sk-test",
    });

    expect(provider.name).toBe("openai-compatible");
  });

  it("accepts an explicit baseUrl override", () => {
    const provider = createProviderForModelConfig({
      provider: "custom",
      model: "my-model",
      apiKey: "sk-test",
      baseUrl: "https://example.invalid/v1",
    });

    expect(provider.name).toBe("openai-compatible");
  });
});

describe("GLM 端点契约", () => {
  /**
   * GLM 的两个端点服务不同计费模式：
   *   /api/paas/v4         按量计费
   *   /api/coding/paas/v4  code plan 套餐额度
   *
   * 曾默认取前者，导致套餐用户第一次请求就收到 429「余额不足或无可用资源包」。
   * 这条测试锁住默认值，同时确保 wizard 与 provider-factory 不会再次分叉。
   */
  it("wizard 与 provider-factory 使用同一个 GLM 端点", () => {
    expect(getDefaultBaseUrlForProvider("glm")).toBe(
      "https://open.bigmodel.cn/api/coding/paas/v4",
    );
  });

  it("默认走 coding 端点而非按量计费端点", () => {
    const baseUrl = getDefaultBaseUrlForProvider("glm");

    expect(baseUrl).toContain("/api/coding/paas/v4");
    expect(baseUrl).not.toBe("https://open.bigmodel.cn/api/paas/v4");
  });
});
