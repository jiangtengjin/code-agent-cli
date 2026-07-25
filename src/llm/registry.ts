import type { Config } from "../types/config.js";
import { createProviderForModelConfig } from "./provider-factory.js";
import type { LLMProvider } from "./provider.js";
import { RoutedLLMProvider } from "./router.js";

export function createProviderFromConfig(config: Config): LLMProvider {
  if (config.models && Object.keys(config.models).length > 0) {
    return new RoutedLLMProvider(config);
  }

  if (!config.model?.model) {
    throw new Error("Model not configured, run code-agent init");
  }

  return createProviderForModelConfig(config.model);
}
