import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenAICompatibleProvider } from '../../../src/llm/adapters/openai-compat.js'

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = originalFetch
  })

  it('sends correct request format', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hello!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'deepseek-coder',
      }),
    })

    const provider = new OpenAICompatibleProvider({
      model: 'deepseek-coder',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
    })

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'Hi' }],
      systemPrompt: 'You are helpful',
    })

    expect(result.content).toBe('Hello!')
    expect(result.model).toBe('deepseek-coder')
    expect(result.usage?.totalTokens).toBe(15)

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('https://api.deepseek.com/v1/chat/completions')
    const body = JSON.parse(call[1].body)
    expect(body.model).toBe('deepseek-coder')
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
  })

  it('handles tool_calls in response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path":"test.txt"}' },
            }],
          },
        }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        model: 'deepseek-coder',
      }),
    })

    const provider = new OpenAICompatibleProvider({
      model: 'deepseek-coder',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
    })

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'Read file' }],
    })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls![0].name).toBe('read_file')
    expect(result.toolCalls![0].args).toEqual({ path: 'test.txt' })
  })

  it('throws on 401 error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Invalid API Key'),
    })

    const provider = new OpenAICompatibleProvider({
      model: 'deepseek-coder',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-wrong',
    })

    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toThrow('401')
  })

  it('throws on network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    const provider = new OpenAICompatibleProvider({
      model: 'deepseek-coder',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
    })

    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toThrow()
  })

  it('forwards abort signals to fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hello!' } }],
        model: 'deepseek-coder',
      }),
    })

    const provider = new OpenAICompatibleProvider({
      model: 'deepseek-coder',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
    })
    const abortController = new AbortController()

    await provider.chat({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: abortController.signal,
    } as any)

    expect(mockFetch.mock.calls[0][1]?.signal).toBe(abortController.signal)
  })
})

describe('createProviderFromConfig', () => {
  it('creates OpenAICompatibleProvider for deepseek config', async () => {
    const { createProviderFromConfig } = await import('../../../src/llm/registry.js')
    const provider = createProviderFromConfig({
      model: {
        provider: 'deepseek',
        model: 'deepseek-coder',
        apiKey: 'sk-test',
        baseUrl: 'https://api.deepseek.com/v1',
      },
    } as any)

    expect(provider.name).toBe('openai-compatible')
  })

  it('creates a routed provider when multiple models are configured', async () => {
    const { createProviderFromConfig } = await import('../../../src/llm/registry.js')
    const provider = createProviderFromConfig({
      model: {
        provider: 'deepseek',
        model: 'fallback',
        apiKey: 'sk-fallback',
      },
      models: {
        code: {
          provider: 'deepseek',
          model: 'deepseek-coder',
          apiKey: 'sk-code',
        },
      },
    } as any)

    expect(provider.name).toBe('model-router')
  })

  it('creates a routed provider when only routed models are configured', async () => {
    const { createProviderFromConfig } = await import('../../../src/llm/registry.js')
    const provider = createProviderFromConfig({
      models: {
        default: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          apiKey: 'sk-default',
        },
      },
    } as any)

    expect(provider.name).toBe('model-router')
  })

  it('throws if apiKey is missing', async () => {
    const { createProviderFromConfig } = await import('../../../src/llm/registry.js')
    expect(() => createProviderFromConfig({
      model: { provider: 'deepseek', model: 'test' },
    })).toThrow('not configured')
  })
})
