import type { LLMMessage, LLMResponse } from '../types/provider.js'

export interface ChatParams {
  messages: LLMMessage[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}

export interface LLMProvider {
  readonly name: string
  chat(params: ChatParams): Promise<LLMResponse>
}
