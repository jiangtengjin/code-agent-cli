import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

const providerMocks = vi.hoisted(() => ({
  chat: vi.fn(),
}))

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
  emitKeypressEvents: vi.fn(),
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
    ).toBe('耗时: 总计 3.2s · 思考 1.5s · 工具 2 次 800ms · 轮次 3')
  })
})

describe('runPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})

describe('startChat', () => {
  let tempDirs: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it('exits if no apiKey configured', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const { startChat } = await import('../../src/cli/chat.js')

    await startChat({} as any)

    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
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

  it('shows thinking message when user sends input', async () => {
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

    // User message should render with a left bar
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('hello'))

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
})
