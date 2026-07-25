import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

const providerMocks = vi.hoisted(() => ({
  chat: vi.fn(),
}))

const spinnerMocks = vi.hoisted(() => {
  const spinner = {
    text: '',
    start: vi.fn(() => spinner),
    stop: vi.fn(() => spinner),
  }
  const ora = vi.fn((options?: { text?: string }) => {
    spinner.text = options?.text ?? ''
    return spinner
  })

  return { ora, spinner }
})

const readlineMocks = vi.hoisted(() => ({
  emitKeypressEvents: vi.fn(),
}))

const mcpManagerMocks = vi.hoisted(() => {
  const instances: Array<{
    startAll: ReturnType<typeof vi.fn>
    stopAll: ReturnType<typeof vi.fn>
    getSummary: ReturnType<typeof vi.fn>
  }> = []
  let summary = { servers: 0, tools: 0 }

  const MCPServerManager = vi.fn(() => {
    const instance = {
      startAll: vi.fn().mockResolvedValue(undefined),
      stopAll: vi.fn().mockResolvedValue(undefined),
      getSummary: vi.fn(() => summary),
    }
    instances.push(instance)
    return instance
  })

  return {
    MCPServerManager,
    instances,
    setSummary: (nextSummary: { servers: number; tools: number }) => {
      summary = nextSummary
    },
  }
})

const mockRl = {
  prompt: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  setPrompt: vi.fn(),
  write: vi.fn(),
  question: vi.fn(),
}

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => mockRl),
  emitKeypressEvents: readlineMocks.emitKeypressEvents,
}))

vi.mock('ora', () => ({
  default: spinnerMocks.ora,
}))

vi.mock('chalk', () => ({
  default: new Proxy({}, { get: () => (s: string) => s }),
  red: (s: string) => s,
  yellow: (s: string) => s,
  green: (s: string) => s,
  cyan: (s: string) => s,
  gray: (s: string) => s,
  bold: (s: string) => s,
}))

vi.mock('../../src/llm/registry.js', () => ({
  createProviderFromConfig: vi.fn(() => ({
    name: 'mock-provider',
    chat: providerMocks.chat,
  })),
}))

vi.mock('../../src/tools/mcp/manager.js', () => ({
  MCPServerManager: mcpManagerMocks.MCPServerManager,
}))

describe('slash command suggestions', () => {
  it('matches commands by name, alias, and Chinese intent keywords', async () => {
    const { getSlashCommandSuggestions } = await import('../../src/cli/chat.js')

    expect(getSlashCommandSuggestions('/he')[0]).toMatchObject({ kind: 'command', value: 'help' })
    expect(getSlashCommandSuggestions('/q')[0]).toMatchObject({ kind: 'command', value: 'exit' })
    expect(getSlashCommandSuggestions('/切换')[0]).toMatchObject({
      kind: 'command',
      value: 'mode',
    })
    expect(getSlashCommandSuggestions('/清空')[0]).toMatchObject({
      kind: 'command',
      value: 'clear',
    })
  })

  it('returns mode value suggestions after /mode', async () => {
    const { getSlashCommandSuggestions } = await import('../../src/cli/chat.js')

    expect(getSlashCommandSuggestions('/mode p')[0]).toMatchObject({
      kind: 'mode',
      value: 'plan',
    })
  })

  it('builds tab completions without forcing ambiguous choices', async () => {
    const { getSlashCommandCompletion } = await import('../../src/cli/chat.js')

    expect(getSlashCommandCompletion('/h')).toEqual({
      start: 1,
      end: 2,
      replacement: 'help ',
    })
    expect(getSlashCommandCompletion('/m')).toEqual({
      start: 1,
      end: 2,
      replacement: 'mod',
    })
    expect(getSlashCommandCompletion('/mod')).toBeNull()
    expect(getSlashCommandCompletion('/清空')).toEqual({
      start: 1,
      end: 3,
      replacement: 'clear ',
    })
    expect(getSlashCommandCompletion('/mode p')).toEqual({
      start: 6,
      end: 7,
      replacement: 'plan',
    })
  })

  it('suggests the usage command', async () => {
    const { getSlashCommandSuggestions, getSlashCommandCompletion } = await import('../../src/cli/chat.js')

    expect(getSlashCommandSuggestions('/us')[0]).toMatchObject({
      kind: 'command',
      value: 'usage',
    })
    expect(getSlashCommandCompletion('/us')).toEqual({
      start: 1,
      end: 3,
      replacement: 'usage ',
    })
  })

  it('suggests the cost command', async () => {
    const { getSlashCommandSuggestions, getSlashCommandCompletion } = await import('../../src/cli/chat.js')

    expect(getSlashCommandSuggestions('/co')[0]).toMatchObject({
      kind: 'command',
      value: 'cost',
    })
    expect(getSlashCommandCompletion('/co')).toEqual({
      start: 1,
      end: 3,
      replacement: 'cost ',
    })
  })
})

describe('task timing', () => {
  it('formats total, thinking, tool, and iteration timing', async () => {
    const { formatTaskTiming } = await import('../../src/cli/chat.js')

    expect(
      formatTaskTiming(
        {
          startedAt: 1000,
          thinkingMs: 1500,
          toolMs: 800,
          toolCalls: 2,
          iterations: 3,
        },
        4200,
      ),
    ).toBe('Elapsed: total 3.2s | thinking 1.5s | tools 2 calls 800ms | iterations 3')
  })
})

describe('runPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mcpManagerMocks.instances.length = 0
    mcpManagerMocks.setSummary({ servers: 0, tools: 0 })
    providerMocks.chat.mockResolvedValue({ content: 'single reply', model: 'test' })
  })

  it('sends the prompt as a user message and prints the response', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runPrompt } = await import('../../src/cli/chat.js')

    await runPrompt(
      {
        model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      } as any,
      'hello from prompt',
    )

    expect(providerMocks.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'hello from prompt' }],
        tools: expect.any(Array),
      }),
    )
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('single reply'))
    expect(mockRl.on).not.toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('starts and stops MCP servers around prompt execution', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runPrompt } = await import('../../src/cli/chat.js')
    const mcpServers = {
      filesystem: { command: 'node', args: ['mcp-server.js'] },
    }

    await runPrompt(
      {
        model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
        mcpServers,
      } as any,
      'hello from prompt',
    )

    const instance = mcpManagerMocks.instances[0]
    expect(mcpManagerMocks.MCPServerManager).toHaveBeenCalledWith(
      mcpServers,
      expect.anything(),
      expect.objectContaining({ onWarning: expect.any(Function) }),
    )
    expect(instance.startAll).toHaveBeenCalledTimes(1)
    expect(providerMocks.chat).toHaveBeenCalledTimes(1)
    expect(instance.stopAll).toHaveBeenCalledTimes(1)
    expect(instance.startAll.mock.invocationCallOrder[0]).toBeLessThan(
      providerMocks.chat.mock.invocationCallOrder[0],
    )
    expect(instance.stopAll.mock.invocationCallOrder[0]).toBeGreaterThan(
      providerMocks.chat.mock.invocationCallOrder[0],
    )

    logSpy.mockRestore()
  })
})

describe('startChat', () => {
  let tempDirs: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    mcpManagerMocks.instances.length = 0
    mcpManagerMocks.setSummary({ servers: 0, tools: 0 })
    readlineMocks.emitKeypressEvents.mockImplementation(() => undefined)
    vi.spyOn(process.stdin, 'prependListener').mockImplementation(() => process.stdin)
    vi.spyOn(process.stdin, 'removeListener').mockImplementation(() => process.stdin)
    spinnerMocks.spinner.text = ''
    providerMocks.chat.mockResolvedValue({ content: 'mock reply', model: 'test' })
    mockRl.question.mockImplementation((_question: string, cb: (answer: string) => void) => {
      cb('n')
    })
    tempDirs = []
  })

  afterEach(async () => {
    for (const tempDir of tempDirs) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
    vi.restoreAllMocks()
  })

  it('exits if no apiKey configured', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const { startChat } = await import('../../src/cli/chat.js')

    await startChat({} as any)

    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('shows MCP summary in the welcome output', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mcpManagerMocks.setSummary({ servers: 2, tools: 5 })
    const { startChat } = await import('../../src/cli/chat.js')

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mcpServers: {
        filesystem: { command: 'node', args: ['mcp-server.js'] },
      },
    } as any)

    const instance = mcpManagerMocks.instances[0]
    expect(instance.startAll).toHaveBeenCalledTimes(1)
    expect(instance.getSummary).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('deepseek/test'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MCP: 2 servers / 5 tools'))

    logSpy.mockRestore()
  })

  it('starts chat when only routed models are configured', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { startChat } = await import('../../src/cli/chat.js')

    await startChat({
      models: {
        default: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      },
    } as any)

    expect(exitSpy).not.toHaveBeenCalled()
    expect(mockRl.on).toHaveBeenCalled()

    logSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('stops MCP servers when readline closes', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const callbacks: Record<string, () => Promise<void> | void> = {}
    mockRl.on.mockImplementation((event: string, cb: () => Promise<void> | void) => {
      callbacks[event] = cb
    })
    const { startChat } = await import('../../src/cli/chat.js')

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mcpServers: {
        filesystem: { command: 'node', args: ['mcp-server.js'] },
      },
    } as any)

    await callbacks.close()

    expect(mcpManagerMocks.instances[0].stopAll).toHaveBeenCalledTimes(1)
    expect(mockRl.close).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)

    logSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('stops MCP servers before exiting from slash /exit', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const callbacks: Record<string, (input: string) => Promise<void> | void> = {}
    mockRl.on.mockImplementation((event: string, cb: (input: string) => Promise<void> | void) => {
      callbacks[event] = cb
    })
    mockRl.close.mockImplementation(() => {
      void callbacks.close?.()
    })
    const { startChat } = await import('../../src/cli/chat.js')

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mcpServers: {
        filesystem: { command: 'node', args: ['mcp-server.js'] },
      },
    } as any)

    await callbacks.line('/exit')

    const instance = mcpManagerMocks.instances[0]
    expect(instance.stopAll).toHaveBeenCalledTimes(1)
    expect(instance.stopAll.mock.invocationCallOrder[0]).toBeLessThan(
      exitSpy.mock.invocationCallOrder[0],
    )
    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(mockRl.close).toHaveBeenCalledTimes(1)

    logSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('stops MCP servers if chat setup fails after startup', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const setupError = new Error('keypress setup failed')
    readlineMocks.emitKeypressEvents.mockImplementationOnce(() => {
      throw setupError
    })
    const { startChat } = await import('../../src/cli/chat.js')

    await expect(
      startChat({
        model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
        mcpServers: {
          filesystem: { command: 'node', args: ['mcp-server.js'] },
        },
      } as any),
    ).rejects.toThrow('keypress setup failed')

    const instance = mcpManagerMocks.instances[0]
    expect(instance.startAll).toHaveBeenCalledTimes(1)
    expect(instance.stopAll).toHaveBeenCalledTimes(1)
    expect(mockRl.close).toHaveBeenCalledTimes(1)
    expect(instance.stopAll.mock.invocationCallOrder[0]).toBeGreaterThan(
      instance.startAll.mock.invocationCallOrder[0],
    )

    logSpy.mockRestore()
  })

  it('processes slash /help command', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('/help')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/help'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/model'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/clear'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/exit'))

    logSpy.mockRestore()
  })

  it('processes slash /clear command', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('/clear')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('已清空'))

    logSpy.mockRestore()
  })

  it('processes slash command aliases', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('/cls')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('已清空'))

    logSpy.mockRestore()
  })

  it('handles unknown slash command', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('/unknown')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('未知命令'))

    logSpy.mockRestore()
  })

  it('does not echo the submitted user input a second time', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('hello')

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('hello'))

    logSpy.mockRestore()
  })

  it('stops the spinner when mode execution returns without assistant output', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat.mockResolvedValueOnce({
      content: '',
      model: 'test',
      usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
    })
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => Promise<void> | void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('empty response')

    expect(spinnerMocks.spinner.stop).toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('stops the spinner before printing token usage', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat.mockResolvedValueOnce({
      content: '',
      model: 'test',
      usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
    })
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => Promise<void> | void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('usage response')

    const firstStopOrder = spinnerMocks.spinner.stop.mock.invocationCallOrder[0]
    const tokenLogCall = logSpy.mock.calls.find(([message]) =>
      String(message).includes('Token: input 1 / output 0'),
    )
    expect(tokenLogCall).toBeDefined()
    const tokenLogOrder =
      logSpy.mock.invocationCallOrder[logSpy.mock.calls.indexOf(tokenLogCall as [unknown])]
    expect(firstStopOrder).toBeLessThan(tokenLogOrder)

    logSpy.mockRestore()
  })

  it('skips tool confirmation when yolo is enabled', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-agent-yolo-'))
    tempDirs.push(tempDir)
    const filePath = path.join(tempDir, 'created.txt')

    providerMocks.chat
      .mockResolvedValueOnce({
        content: '',
        model: 'test',
        toolCalls: [
          {
            id: 'call-1',
            name: 'write_file',
            args: { path: filePath, content: 'created by yolo' },
          },
        ],
      })
      .mockResolvedValueOnce({ content: 'done', model: 'test' })

    const { startChat } = await import('../../src/cli/chat.js')
    const lineCallbacks: Array<(input: string) => Promise<void> | void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      yolo: true,
    } as any)

    await lineCallbacks[0]('create a file')

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('created by yolo')
    expect(mockRl.question).not.toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('prints cumulative token usage with /usage', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat.mockResolvedValueOnce({
      content: 'reply with usage',
      model: 'test',
      usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
    })
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => Promise<void> | void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('hello')
    await lineCallbacks[0]('/usage')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Total tokens: 18'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('LLM calls: 1'))

    logSpy.mockRestore()
  })

  it('prints cumulative cost usage with /cost', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat.mockResolvedValueOnce({
      content: 'reply with cost',
      model: 'deepseek-v4-flash',
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
    })
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => Promise<void> | void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'sk-test' },
      costGuard: { monthlyBudget: 10, warnAtPercent: 80 },
    } as any)

    await lineCallbacks[0]('hello')
    await lineCallbacks[0]('/cost')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Cost usage'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('deepseek-v4-flash'))

    logSpy.mockRestore()
  })

  it('keeps cumulative token usage after /clear', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat
      .mockResolvedValueOnce({
        content: 'first reply',
        model: 'test',
        usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: 'second reply',
        model: 'test',
        usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
      })
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => Promise<void> | void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any)

    await lineCallbacks[0]('first')
    await lineCallbacks[0]('/clear')
    await lineCallbacks[0]('second')
    await lineCallbacks[0]('/usage')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Prompt tokens: 6'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Completion tokens: 9'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Total tokens: 15'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('LLM calls: 2'))

    logSpy.mockRestore()
  })

  it('uses the auto mode iteration cap when configured', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat.mockResolvedValue({
      content: '',
      model: 'test',
      toolCalls: [{ id: 'call-1', name: 'missing_tool', args: {} }],
    })
    const { startChat } = await import('../../src/cli/chat.js')

    const lineCallbacks: Array<(input: string) => Promise<void> | void> = []
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb)
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mode: 'auto',
    } as any)

    await lineCallbacks[0]('run autonomously')

    expect(providerMocks.chat).toHaveBeenCalledTimes(25)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Reached max execution steps'),
    )

    logSpy.mockRestore()
  })

  it('creates a plan in plan mode and waits for approval', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: '为任务生成 2 个可执行步骤',
        steps: [
          { title: '分析代码结构', prompt: '读取并分析项目结构' },
          { title: '实现认证模块', prompt: '创建并修改认证相关文件' },
        ],
      }),
      model: 'test',
    })
    const { startChat } = await import('../../src/cli/chat.js')

    const callbacks: Record<string, (input: string) => Promise<void> | void> = {}
    mockRl.on.mockImplementation((event: string, cb: (input: string) => Promise<void> | void) => {
      callbacks[event] = cb
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mode: 'plan',
    } as any)

    await callbacks.line('给项目添加 JWT 认证')

    expect(providerMocks.chat).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls.filter(([message]) => String(message).includes('[PLAN]'))).toHaveLength(1)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Enter Y to execute'))
    expect(mockRl.prompt.mock.calls.length).toBeGreaterThan(1)

    logSpy.mockRestore()
  })

  it('executes an approved plan after the user confirms', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat
      .mockResolvedValueOnce({
        content: JSON.stringify({
          summary: '为任务生成 2 个可执行步骤',
          steps: [
            { title: '分析代码结构', prompt: '读取并分析项目结构' },
            { title: '实现认证模块', prompt: '创建并修改认证相关文件' },
          ],
        }),
        model: 'test',
      })
      .mockResolvedValueOnce({ content: '已分析项目结构', model: 'test' })
      .mockResolvedValueOnce({ content: '已完成认证模块实现', model: 'test' })
    const { startChat } = await import('../../src/cli/chat.js')

    const callbacks: Record<string, (input: string) => Promise<void> | void> = {}
    mockRl.on.mockImplementation((event: string, cb: (input: string) => Promise<void> | void) => {
      callbacks[event] = cb
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mode: 'plan',
    } as any)

    await callbacks.line('给项目添加 JWT 认证')
    await callbacks.line('y')

    expect(providerMocks.chat).toHaveBeenCalledTimes(3)
    expect(logSpy.mock.calls.filter(([message]) => String(message).includes('─── PLAN'))).toHaveLength(0)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Plan completed'))

    logSpy.mockRestore()
  })

  it('runs prompts when only routed models are configured', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runPrompt } = await import('../../src/cli/chat.js')

    await runPrompt(
      {
        models: {
          default: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
        },
      } as any,
      'hello from routed prompt',
    )

    expect(exitSpy).not.toHaveBeenCalled()
    expect(providerMocks.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'hello from routed prompt' }],
      }),
    )

    logSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('tracks cost for plan generation and approved steps in yolo prompt mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { CostTracker } = await import('../../src/llm/cost-tracker.js')
    const recordSpy = vi.spyOn(CostTracker.prototype, 'record')

    providerMocks.chat
      .mockResolvedValueOnce({
        content: JSON.stringify({
          summary: 'Plan summary',
          steps: [{ title: 'Inspect auth flow', prompt: 'inspect the existing auth flow' }],
        }),
        model: 'deepseek-v4-flash',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      })
      .mockResolvedValueOnce({
        content: 'Step completed',
        model: 'deepseek-v4-pro',
        usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
      })

    const { runPrompt } = await import('../../src/cli/chat.js')

    await runPrompt(
      {
        model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
        mode: 'plan',
        yolo: true,
        costGuard: { monthlyBudget: 10, warnAtPercent: 80 },
      } as any,
      'add jwt auth',
    )

    expect(recordSpy).toHaveBeenCalledTimes(2)
    expect(recordSpy).toHaveBeenNthCalledWith(1, 'deepseek-v4-flash', {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    })
    expect(recordSpy).toHaveBeenNthCalledWith(2, 'deepseek-v4-pro', {
      promptTokens: 30,
      completionTokens: 10,
      totalTokens: 40,
    })

    logSpy.mockRestore()
  })

  it('clears pending plan state when /clear is issued', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    providerMocks.chat
      .mockResolvedValueOnce({
        content: JSON.stringify({
          summary: 'Plan summary',
          steps: [{ title: 'Inspect auth flow', prompt: 'inspect the existing auth flow' }],
        }),
        model: 'test',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          summary: 'One-letter task',
          steps: [{ title: 'Echo input', prompt: 'echo y' }],
        }),
        model: 'test',
      })

    const { startChat } = await import('../../src/cli/chat.js')
    const callbacks: Record<string, (input: string) => Promise<void> | void> = {}
    mockRl.on.mockImplementation((event: string, cb: (input: string) => Promise<void> | void) => {
      callbacks[event] = cb
    })

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mode: 'plan',
    } as any)

    await callbacks.line('add jwt auth')
    await callbacks.line('/clear')
    await callbacks.line('y')

    expect(providerMocks.chat).toHaveBeenCalledTimes(2)
    expect(providerMocks.chat.mock.calls[1][0].messages).toEqual([{ role: 'user', content: 'y' }])
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Plan completed'))

    logSpy.mockRestore()
  })
})
