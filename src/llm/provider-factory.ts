import type { LLMConfig } from "../types/config.js";
import { OpenAICompatibleProvider } from "./adapters/openai-compat.js";
import type { LLMProvider } from "./provider.js";

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  // GLM 有两个端点：/api/paas/v4 走按量计费，/api/coding/paas/v4 走 code plan
  // 套餐额度。默认取后者——编码智能体的用户基本都用套餐，走前者会直接收到
  // 429「余额不足或无可用资源包」。按量计费用户显式配 baseUrl 覆盖。
  glm: "https://open.bigmodel.cn/api/coding/paas/v4",
  ollama: "http://localhost:11434/v1",
  kimi: "https://api.moonshot.cn/v1",
  doubao: "https://ark.cn-beijing.volces.com/api/v3",
  spark: "https://maas-coding-api.cn-huabei-1.xf-yun.com/v1",
  custom: "",
};

export function createProviderForModelConfig(config: LLMConfig): LLMProvider {
  if (!config.model) {
    throw new Error("Model not configured");
  }

  if (config.provider !== "ollama" && !config.apiKey) {
    throw new Error("API Key not configured, run code-agent init");
  }

  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URLS[config.provider] ?? DEFAULT_BASE_URLS.custom;

  return new OpenAICompatibleProvider({
    model: config.model,
    baseUrl,
    apiKey: config.apiKey ?? "ollama",
  });
}
