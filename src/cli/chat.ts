import * as readline from 'node:readline'
import chalk from 'chalk'
import type { Config } from '../types/config.js'
import type { ChatMode } from '../types/mode.js'
import type { LLMMessage } from '../types/provider.js'
import type { LLMProvider } from '../llm/provider.js'
import { createProviderFromConfig } from '../llm/registry.js'
import { maskApiKey } from '../utils/api-key.js'

function getPrompt(mode: ChatMode): string {
  return chalk.cyan(`${mode} > `)
}

function displayWelcome(config: Config, provider: LLMProvider): void {
  console.log(`
${chalk.cyan('╭──────────────────────────────────────────────╮')}
${chalk.cyan('│')}            ${chalk.bold('Code Agent CLI  v0.1.0')}             ${chalk.cyan('│')}
${chalk.cyan('│')}             ${chalk.gray('终端原生编码智能体')}                 ${chalk.cyan('│')}
${chalk.cyan('│')}                                              ${chalk.cyan('│')}
${chalk.cyan('│')}  模型: ${chalk.green(provider.name)}/${chalk.green(config.model?.model ?? 'unknown')}
${chalk.cyan('│')}  API: ${chalk.green(maskApiKey(config.model?.apiKey ?? ''))}
${chalk.cyan('│')}  目录: ${chalk.green(process.cwd())}
${chalk.cyan('│')}                                              ${chalk.cyan('│')}
${chalk.cyan('│')}  输入 ${chalk.yellow('/help')} 查看可用命令                     ${chalk.cyan('│')}
${chalk.cyan('╰──────────────────────────────────────────────╯')}
`)
}

function handleSlashCommand(
  input: string,
  ctx: {
    messages: LLMMessage[]
    mode: ChatMode
    config: Config
    setMode: (m: ChatMode) => void
  },
): void {
  const parts = input.slice(1).split(/\s+/)
  const cmd = parts[0].toLowerCase()
  const args = parts.slice(1)

  switch (cmd) {
    case 'help':
      console.log(`
${chalk.bold('可用命令:')}
  ${chalk.yellow('/model')}          查看当前模型
  ${chalk.yellow('/mode <mode>')}    切换模式 (normal/auto/plan/edit)
  ${chalk.yellow('/clear')}          清空对话历史
  ${chalk.yellow('/help')}           显示此帮助
  ${chalk.yellow('/exit')}           退出
`)
      break

    case 'model':
      console.log(chalk.yellow(`当前模型: ${ctx.config.model?.model ?? '未设置'}`))
      break

    case 'mode':
      if (args[0] && ['normal', 'auto', 'plan', 'edit'].includes(args[0])) {
        ctx.setMode(args[0] as ChatMode)
        console.log(chalk.green(`切换到模式: ${args[0]}`))
      } else {
        console.log(chalk.yellow(`当前模式: ${ctx.mode}`))
      }
      break

    case 'clear':
      ctx.messages.length = 0
      console.log(chalk.green('对话历史已清空'))
      break

    case 'exit':
      process.exit(0)

    default:
      console.log(chalk.yellow(`未知命令: /${cmd}。输入 /help 查看可用命令`))
  }
}

function displayResponse(content: string): void {
  console.log(`\n${chalk.cyan('─── AI ────────────────────────────────────────')}`)
  console.log(content)
  console.log(`${chalk.cyan('────────────────────────────────────────────────')}\n`)
}

function displayError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('401')) {
    console.error(chalk.red('认证失败，请检查 API Key 配置'))
  } else if (message.includes('429')) {
    console.error(chalk.red('API 配额不足，请检查账户余额'))
  } else if (message.includes('fetch failed') || message.includes('network')) {
    console.error(chalk.red('请求超时，请检查网络连接'))
  } else if (message.includes('404')) {
    console.error(chalk.red('模型不可用，请检查配置'))
  } else {
    console.error(chalk.red(`请求失败: ${message}`))
  }
}

export async function startChat(config: Config): Promise<void> {
  if (!config.model?.apiKey) {
    console.error(chalk.red('API Key 未配置。请运行 code-agent init 初始化配置。'))
    process.exit(1)
    return
  }

  const provider = createProviderFromConfig(config)
  const messages: LLMMessage[] = []
  let mode: ChatMode = (config.mode as ChatMode) ?? 'normal'

  displayWelcome(config, provider)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPrompt(mode),
  })

  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }

  process.stdin.on('keypress', (_str: string, key: { sequence?: string; name?: string; ctrl?: boolean }) => {
    if (key.sequence === '\x1b[Z') {
      const modes: ChatMode[] = ['normal', 'auto', 'plan', 'edit']
      const idx = modes.indexOf(mode)
      mode = modes[(idx + 1) % modes.length]
      rl.setPrompt(getPrompt(mode))
      rl.prompt(true)
    }
  })

  rl.on('line', async (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) {
      rl.prompt()
      return
    }

    if (trimmed.startsWith('/')) {
      handleSlashCommand(trimmed, {
        messages,
        mode,
        config,
        setMode: (m) => { mode = m; rl.setPrompt(getPrompt(m)); },
      })
      rl.prompt()
      return
    }

    messages.push({ role: 'user', content: trimmed })
    console.log(chalk.yellow('AI 思考中...'))

    try {
      const response = await provider.chat({
        messages,
        systemPrompt: config.systemPrompt,
      })

      messages.push({ role: 'assistant', content: response.content })
      displayResponse(response.content)

      if (response.usage) {
        console.log(chalk.gray(`Token: 输入 ${response.usage.promptTokens} / 输出 ${response.usage.completionTokens}`))
      }
    } catch (error) {
      displayError(error)
    }

    rl.prompt()
  })

  rl.on('close', () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    console.log()
    process.exit(0)
  })

  rl.prompt()
}
