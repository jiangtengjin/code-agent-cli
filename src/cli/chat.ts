import * as readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import type { LLMProvider } from "../llm/provider.js";
import { createProviderFromConfig } from "../llm/registry.js";
import { createDefaultToolRegistry } from "../tools/built-in/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Config } from "../types/config.js";
import type { ChatMode } from "../types/mode.js";
import type { LLMMessage, LLMToolCall } from "../types/provider.js";
import { maskApiKey } from "../utils/api-key.js";
import { isSensitivePath } from "../utils/security.js";

const MODE_COLORS: Record<ChatMode, (text: string) => string> = {
  normal: chalk.cyan,
  auto: chalk.yellow,
  plan: chalk.blue,
  edit: chalk.magenta,
};

function getModeLabel(mode: ChatMode): string {
  return MODE_COLORS[mode](`[${mode}]`);
}

function drawBorderedBox(
  label: string,
  content: string,
  contentColor: (text: string) => string,
): void {
  const lines = content.split("\n");
  const maxContentWidth = Math.max(...lines.map((l) => l.length), label.length + 2);
  const terminalWidth = process.stdout.columns - 6;
  const width = Math.min(maxContentWidth, terminalWidth) + 4;

  console.log(
    `${chalk.dim("┌─ ") + label} ${chalk.dim(`${"─".repeat(Math.max(width - label.length - 4, 0))}┐`)}`,
  );

  for (const line of lines) {
    const display = line.length > width - 4 ? line.slice(0, width - 4) : line;
    const pad = " ".repeat(Math.max(width - 4 - display.length, 0));
    console.log(chalk.dim("│ ") + contentColor(display) + pad + chalk.dim(" │"));
  }

  console.log(chalk.dim(`└${"─".repeat(Math.max(width - 2, 0))}┘`));
}

function drawUserMessage(content: string): void {
  if (!content.trim()) return;
  drawBorderedBox("You", content, chalk.white);
}

function drawInputFrame(mode: ChatMode): void {
  const width = process.stdout.columns - 2;
  const modeText = `[${mode}]`;
  const prefix = "┌─ ❯ ";
  const suffix = "┐";
  const dashes = Math.max(width - prefix.length - modeText.length - suffix.length - 2, 1);
  console.log(
    `${chalk.dim(prefix) + getModeLabel(mode)} ${chalk.dim("─".repeat(dashes) + suffix)}`,
  );
}

function displayWelcome(config: Config, provider: LLMProvider): void {
  console.log(`
${chalk.cyan("╭──────────────────────────────────────────────╮")}
${chalk.cyan("│")}            ${chalk.bold("Code Agent CLI  v0.1.0")}             ${chalk.cyan("│")}
${chalk.cyan("│")}             ${chalk.gray("终端原生编码智能体")}                 ${chalk.cyan("│")}
${chalk.cyan("│")}                                              ${chalk.cyan("│")}
${chalk.cyan("│")}  模型: ${chalk.green(provider.name)}/${chalk.green(config.model?.model ?? "unknown")}
${chalk.cyan("│")}  API: ${chalk.green(maskApiKey(config.model?.apiKey ?? ""))}
${chalk.cyan("│")}  目录: ${chalk.green(process.cwd())}
${chalk.cyan("│")}                                              ${chalk.cyan("│")}
${chalk.cyan("│")}  输入 ${chalk.yellow("/help")} 查看可用命令                     ${chalk.cyan("│")}
${chalk.cyan("╰──────────────────────────────────────────────╯")}
`);
}

function handleSlashCommand(
  input: string,
  ctx: {
    messages: LLMMessage[];
    mode: ChatMode;
    config: Config;
    setMode: (m: ChatMode) => void;
  },
): void {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case "help":
      console.log(`
${chalk.bold("可用命令:")}
  ${chalk.yellow("/model")}          查看当前模型
  ${chalk.yellow("/mode <mode>")}    切换模式 (normal/auto/plan/edit)
  ${chalk.yellow("/clear")}          清空对话历史
  ${chalk.yellow("/help")}           显示此帮助
  ${chalk.yellow("/exit")}           退出
`);
      break;

    case "model":
      console.log(chalk.yellow(`当前模型: ${ctx.config.model?.model ?? "未设置"}`));
      break;

    case "mode":
      if (args[0] && ["normal", "auto", "plan", "edit"].includes(args[0])) {
        ctx.setMode(args[0] as ChatMode);
        console.log(chalk.green(`切换到模式: ${args[0]}`));
      } else {
        console.log(chalk.yellow(`当前模式: ${ctx.mode}`));
      }
      break;

    case "clear":
      ctx.messages.length = 0;
      console.log(chalk.green("对话历史已清空"));
      break;

    case "exit":
      process.exit(0);
      break;

    default:
      console.log(chalk.yellow(`未知命令: /${cmd}。输入 /help 查看可用命令`));
  }
}

function displayError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("401")) {
    console.error(chalk.red("认证失败，请检查 API Key 配置"));
  } else if (message.includes("429")) {
    console.error(chalk.red("API 配额不足，请检查账户余额"));
  } else if (message.includes("fetch failed") || message.includes("network")) {
    console.error(chalk.red("请求超时，请检查网络连接"));
  } else if (message.includes("404")) {
    console.error(chalk.red("模型不可用，请检查配置"));
  } else {
    console.error(chalk.red(`请求失败: ${message}`));
  }
}

async function handleToolCalls(
  toolCalls: LLMToolCall[],
  toolRegistry: ToolRegistry,
  messages: LLMMessage[],
  rl: readline.Interface,
): Promise<void> {
  for (const toolCall of toolCalls) {
    const tool = toolRegistry.get(toolCall.name);

    if (!tool) {
      console.log(chalk.red(`未知工具: ${toolCall.name}`));
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: false, error: `未知工具: ${toolCall.name}` }),
      });
      continue;
    }

    console.log(chalk.cyan(`\n─── 工具调用: ${tool.name} ───────────────────────`));
    console.log(chalk.gray(`参数: ${JSON.stringify(toolCall.args, null, 2)}`));

    if (tool.requiresConfirm) {
      const confirmed = await userConfirm(toolCall, rl);
      if (!confirmed) {
        console.log(chalk.yellow("用户取消操作"));
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: JSON.stringify({ success: false, error: "用户取消" }),
        });
        continue;
      }
    }

    const result = await tool.execute(toolCall.args);

    if (result.success) {
      console.log(chalk.green("✓ 执行成功"));
      if (result.metadata?.diff) {
        console.log(chalk.gray("Diff:"));
        console.log(result.metadata.diff);
      }
    } else {
      console.log(chalk.red(`✗ 执行失败: ${result.error}`));
    }

    messages.push({
      role: "tool",
      toolCallId: toolCall.id,
      content: JSON.stringify(result),
    });
  }
}

function userConfirm(toolCall: LLMToolCall, rl: readline.Interface): Promise<boolean> {
  return new Promise((resolve) => {
    const argsStr = JSON.stringify(toolCall.args, null, 2);
    const isSensitive = isSensitivePath(argsStr);

    const warning = isSensitive ? chalk.red("⚠ 检测到敏感文件操作！") : "";

    rl.question(`${warning}\n确认执行 ${toolCall.name}? (y/N): `, (answer) => {
      resolve(answer.toLowerCase() === "y");
    });
  });
}

export async function startChat(config: Config): Promise<void> {
  if (!config.model?.apiKey) {
    console.error(chalk.red("API Key 未配置。请运行 code-agent init 初始化配置。"));
    process.exit(1);
    return;
  }

  const provider = createProviderFromConfig(config);
  const toolRegistry = createDefaultToolRegistry();
  const messages: LLMMessage[] = [];
  let mode: ChatMode = (config.mode as ChatMode) ?? "normal";

  displayWelcome(config, provider);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "",
    terminal: true,
  });

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.prependListener(
    "keypress",
    (_str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.name === "tab" || (key.name === "t" && key.ctrl)) {
        cycleMode();
        if (key.name === "tab") {
          process.nextTick(() => rl.write(null, { name: "backspace" }));
        }
      }
    },
  );

  function cycleMode(): void {
    const modes: ChatMode[] = ["normal", "auto", "plan", "edit"];
    const idx = modes.indexOf(mode);
    mode = modes[(idx + 1) % modes.length];
    drawInputFrame(mode);
    rl.setPrompt(chalk.dim("│ ") + chalk.cyan("❯ "));
    rl.prompt(true);
  }

  rl.on("line", async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      drawInputFrame(mode);
      rl.setPrompt(chalk.dim("│ ") + chalk.cyan("❯ "));
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("/")) {
      handleSlashCommand(trimmed, {
        messages,
        mode,
        config,
        setMode: (m) => {
          mode = m;
          rl.setPrompt(chalk.dim("│ ") + chalk.cyan("❯ "));
        },
      });
      drawInputFrame(mode);
      rl.setPrompt(chalk.dim("│ ") + chalk.cyan("❯ "));
      rl.prompt();
      return;
    }

    drawUserMessage(trimmed);
    messages.push({ role: "user", content: trimmed });

    const spinner = ora({ text: "AI 思考中...", color: "cyan" }).start();

    try {
      const response = await provider.chat({
        messages,
        systemPrompt: config.systemPrompt,
        tools: toolRegistry.getToolDefinitions(),
      });

      spinner.stop();

      if (response.toolCalls && response.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: response.content || null,
          toolCalls: response.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          })),
        });
        await handleToolCalls(response.toolCalls, toolRegistry, messages, rl);
      } else if (response.content) {
        messages.push({ role: "assistant", content: response.content });
        const header = chalk.dim("─── AI ────────────────────────────────────────");
        const footer = chalk.dim("────────────────────────────────────────────────");
        console.log(`\n${header}\n${response.content}\n${footer}\n`);
      }

      if (response.usage) {
        console.log(
          chalk.gray(
            `Token: 输入 ${response.usage.promptTokens} / 输出 ${response.usage.completionTokens}`,
          ),
        );
      }
    } catch (error) {
      spinner.stop();
      displayError(error);
    }

    drawInputFrame(mode);
    rl.setPrompt(chalk.dim("│ ") + chalk.cyan("❯ "));
    rl.prompt();
  });

  drawInputFrame(mode);
  rl.setPrompt(chalk.dim("│ ") + chalk.cyan("❯ "));
  rl.prompt();

  rl.on("close", () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    console.log();
    process.exit(0);
  });
}
