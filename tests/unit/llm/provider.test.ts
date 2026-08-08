import { describe, expect, it } from "vitest";
import type { ChatParams, LLMProvider } from "../../src/llm/provider.js";
import type { LLMResponse } from "../../src/types/provider.js";

describe("LLMProvider interface", () => {
  it("can be implemented by a mock", async () => {
    const mock: LLMProvider = {
      name: "mock",
      async chat(_params: ChatParams): Promise<LLMResponse> {
        return {
          content: "mock response",
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          model: "mock",
        };
      },
    };

    const result = await mock.chat({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.content).toBe("mock response");
    expect(result.model).toBe("mock");
    expect(result.usage?.totalTokens).toBe(20);
  });

  it("ChatParams requires messages array", () => {
    const params: ChatParams = {
      messages: [{ role: "user", content: "test" }],
    };
    expect(params.messages).toHaveLength(1);
  });

  it("ChatParams allows optional fields", () => {
    const params: ChatParams = {
      messages: [{ role: "user", content: "test" }],
      systemPrompt: "You are a helper",
      maxTokens: 1000,
      temperature: 0.7,
    };
    expect(params.systemPrompt).toBe("You are a helper");
    expect(params.maxTokens).toBe(1000);
    expect(params.temperature).toBe(0.7);
  });
});
