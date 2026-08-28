import { describe, expect, it, vi } from "vitest";
import { fetchAvailableModels } from "../../../src/llm/model-discovery.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const GLM_PAYLOAD = {
  object: "list",
  data: [
    { id: "glm-4.5", object: "model", created: 1753632000, owned_by: "z-ai" },
    { id: "glm-5.3", object: "model", created: 1786636800, owned_by: "z-ai" },
    { id: "glm-4.6", object: "model", created: 1759276800, owned_by: "z-ai" },
  ],
};

describe("fetchAvailableModels", () => {
  it("解析 OpenAI 标准的模型列表", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GLM_PAYLOAD));

    const result = await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1", apiKey: "sk-test" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.failure).toBeUndefined();
    expect(result.models).toHaveLength(3);
    expect(result.models[0]).toMatchObject({ id: "glm-5.3", ownedBy: "z-ai" });
  });

  it("把最新的模型排在最前面", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GLM_PAYLOAD));

    const result = await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1", apiKey: "sk-test" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.models.map((model) => model.id)).toEqual(["glm-5.3", "glm-4.6", "glm-4.5"]);
  });

  it("缺少 created 时按名称排序以保证结果稳定", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ id: "b-model" }, { id: "a-model" }] }),
    );

    const result = await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.models.map((model) => model.id)).toEqual(["a-model", "b-model"]);
  });

  it("请求时带上 Authorization 头", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GLM_PAYLOAD));

    await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1", apiKey: "sk-secret" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.invalid/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer sk-secret" } }),
    );
  });

  it("去掉 baseUrl 末尾多余的斜杠", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GLM_PAYLOAD));

    await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1///" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).toHaveBeenCalledWith("https://example.invalid/v1/models", expect.anything());
  });

  it("401 归类为 key 无效", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "bad key" }, 401));

    const result = await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1", apiKey: "sk-bad" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.failure).toBe("unauthorized");
    expect(result.message).toContain("API Key 无效");
    expect(result.models).toEqual([]);
  });

  it("404 归类为厂商不支持该端点", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404));

    const result = await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.failure).toBe("unsupported");
    expect(result.message).toContain("手动输入");
  });

  it("网络异常降级而不抛错", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    const result = await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.failure).toBe("network");
    expect(result.message).toContain("ECONNREFUSED");
  });

  it("响应不是 JSON 时归类为格式错误", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));

    const result = await fetchAvailableModels(
      { baseUrl: "https://example.invalid/v1" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.failure).toBe("malformed");
  });

  it("data 为空或结构不符时归类为格式错误", async () => {
    const cases = [{ data: [] }, { data: "not-an-array" }, {}, { data: [{ noId: true }] }];

    for (const payload of cases) {
      const result = await fetchAvailableModels(
        { baseUrl: "https://example.invalid/v1" },
        { fetchImpl: (async () => jsonResponse(payload)) as unknown as typeof fetch },
      );
      expect(result.failure).toBe("malformed");
    }
  });

  it("没有 baseUrl 时直接返回失败且不发请求", async () => {
    const fetchImpl = vi.fn();

    const result = await fetchAvailableModels(
      { apiKey: "sk-test" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.failure).toBe("missing_base_url");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("无 apiKey 时不带 Authorization 头（本地 ollama 场景）", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ id: "qwen2.5-coder:7b" }] }));

    const result = await fetchAvailableModels(
      { baseUrl: "http://localhost:11434/v1" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:11434/v1/models",
      expect.objectContaining({ headers: {} }),
    );
    expect(result.models[0].id).toBe("qwen2.5-coder:7b");
  });
});
