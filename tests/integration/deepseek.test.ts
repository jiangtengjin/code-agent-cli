import { describe, expect, it } from "vitest";
import { OpenAICompatibleProvider } from "../../src/llm/adapters/openai-compat.js";

const API_KEY = process.env.CODE_AGENT_API_KEY;
const TEST_MODEL = process.env.CODE_AGENT_MODEL ?? "deepseek-v4-flash";

describe.runIf(API_KEY)("DeepSeek 集成测试", () => {
  const provider = new OpenAICompatibleProvider({
    model: TEST_MODEL,
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: API_KEY!,
  });

  it("应返回非空回复", async () => {
    const response = await provider.chat({
      messages: [{ role: "user", content: '回复"hello"即可' }],
      maxTokens: 50,
    });

    expect(response.content).toBeTruthy();
    expect(response.content.length).toBeGreaterThan(0);
  }, 30000);

  it("应返回 token 用量", async () => {
    const response = await provider.chat({
      messages: [{ role: "user", content: '回复"ok"即可' }],
      maxTokens: 50,
    });

    expect(response.usage).toBeDefined();
    expect(response.usage?.promptTokens).toBeGreaterThan(0);
    expect(response.usage?.completionTokens).toBeGreaterThan(0);
  }, 30000);

  it("应正确处理多轮对话", async () => {
    const response = await provider.chat({
      messages: [
        { role: "user", content: "我的名字是张三" },
        { role: "assistant", content: "你好张三！" },
        { role: "user", content: "我叫什么名字？" },
      ],
      maxTokens: 50,
    });

    expect(response.content).toContain("张三");
  }, 30000);
});
