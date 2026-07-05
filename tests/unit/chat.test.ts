import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRl = {
  prompt: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  setPrompt: vi.fn(),
  write: vi.fn(),
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

describe('startChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
