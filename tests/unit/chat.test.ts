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

    // User message should render in a bordered box
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('You'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('hello'))

    logSpy.mockRestore()
  })
})
