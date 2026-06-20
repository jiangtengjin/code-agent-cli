import type { LLMProvider } from './provider.js'
import type { Config } from '../types/config.js'
import { OpenAICompatibleProvider } from './adapters/openai-compat.js'

const ADAPTER_MAP: Record<string, string> = {
  deepseek: 'openai-compatible',
  qwen: 'openai-compatible',
  glm: 'openai-compatible',
  ollama: 'openai-compatible',
  custom: 'openai-compatible',
}

export function createProviderFromConfig(config: Config): LLMProvider {
  if (!config.model?.apiKey || !config.model?.model) {
    throw new Error('API Key not configured, run code-agent init')
  }

  const adapterName = ADAPTER_MAP[config.model.provider] ?? 'openai-compatible'
  const baseUrl = config.model.baseUrl ?? 'https://api.deepseek.com/v1'

  if (adapterName === 'openai-compatible') {
    return new OpenAICompatibleProvider({
      model: config.model.model,
      baseUrl,
      apiKey: config.model.apiKey,
    })
  }

  throw new Error(`Unsupported provider: ${config.model.provider}`)
}
