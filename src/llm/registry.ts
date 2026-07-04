import type { Config } from "../types/config.js";
import { OpenAICompatibleProvider } from "./adapters/openai-compat.js";
import type { LLMProvider } from "./provider.js";

const ADAPTER_MAP: Record<string, string> = {
  deepseek: "openai-compatible",
  qwen: "openai-compatible",
  glm: "openai-compatible",
  ollama: "openai-compatible",
  custom: "openai-compatible",
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  ollama: "http://localhost:11434/v1",
};

export function createProviderFromConfig(config: Config): LLMProvider {
  if (!config.model?.apiKey || !config.model?.model) {
    throw new Error("API Key not configured, run code-agent init");
  }

  const adapterName = ADAPTER_MAP[config.model.provider] ?? "openai-compatible";
  const baseUrl =
    config.model.baseUrl ??
    DEFAULT_BASE_URLS[config.model.provider] ??
    "https://api.deepseek.com/v1";

  if (adapterName === "openai-compatible") {
    return new OpenAICompatibleProvider({
      model: config.model.model,
      baseUrl,
      apiKey: config.model.apiKey,
    });
  }

  throw new Error(`Unsupported provider: ${config.model.provider}`);
}
