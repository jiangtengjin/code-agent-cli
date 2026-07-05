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

function drawUserMessage(content: string): void {
  if (!content.trim()) return;
  for (const line of content.split("\n")) {
    console.log(chalk.dim("│ ") + chalk.white(line));
  }
}

function formatInputFrame(mode: ChatMode): string {
  const width = (process.stdout.columns ?? 80) - 2;
  const modeText = `[${mode}]`;
  const prefix = "┌─ ❯ ";
  const suffix = "┐";
  const dashes = Math.max(width - prefix.length - modeText.length - suffix.length - 2, 1);
  return `${chalk.dim(prefix) + getModeLabel(mode)} ${chalk.dim("─".repeat(dashes) + suffix)}`;
}

function drawInputFrame(mode: ChatMode): void {
  console.log(formatInputFrame(mode));
}

function redrawInputFrame(mode: ChatMode): void {
  if (!process.stdout.isTTY) {
    drawInputFrame(mode);
    return;
  }

  process.stdout.write("\x1b[s");
  readline.moveCursor(process.stdout, 0, -1);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  process.stdout.write(formatInputFrame(mode));
  process.stdout.write("\x1b[u");
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

type SlashCommand = {
  name: string;
  desc: string;
  aliases?: string[];
  keywords?: string[];
};

export type SlashSuggestion = {
  kind: "command" | "mode";
  value: string;
  description: string;
  score: number;
};

export type SlashCompletion = {
  start: number;
  end: number;
  replacement: string;
};

const MODES: ChatMode[] = ["normal", "auto", "plan", "edit"];

const COMMANDS: SlashCommand[] = [
  {
    name: "help",
    desc: "显示帮助信息",
    aliases: ["?", "h"],
    keywords: ["帮助", "命令", "说明", "查看命令"],
  },
  {
    name: "model",
    desc: "查看当前模型",
    aliases: ["llm"],
    keywords: ["模型", "当前模型", "model"],
  },
  {
    name: "mode",
    desc: "切换模式 (normal/auto/plan/edit)",
    keywords: ["模式", "切换", "计划", "编辑", "自动"],
  },
  {
    name: "clear",
    desc: "清空对话历史",
    aliases: ["cls"],
    keywords: ["清空", "清除", "历史", "重置"],
  },
  {
    name: "exit",
    desc: "退出程序",
    aliases: ["quit", "q"],
    keywords: ["退出", "关闭", "结束"],
  },
];

function scoreText(
  target: string,
  query: string,
  exact: number,
  prefix: number,
  contains: number,
): number {
  if (!query) return 1;

  const normalizedTarget = target.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (normalizedTarget === normalizedQuery) return exact;
  if (normalizedTarget.startsWith(normalizedQuery)) return prefix;
  if (normalizedTarget.includes(normalizedQuery)) return contains;
  return 0;
}

function scoreCommand(command: SlashCommand, query: string): number {
  if (!query) return 1;

  const scores = [
    scoreText(command.name, query, 100, 90, 60),
    scoreText(command.desc, query, 55, 45, 35),
    ...(command.aliases ?? []).map((alias) => scoreText(alias, query, 95, 85, 55)),
    ...(command.keywords ?? []).map((keyword) => scoreText(keyword, query, 80, 70, 50)),
  ];

  return Math.max(...scores);
}

function getCommandMatches(query: string): SlashSuggestion[] {
  return COMMANDS.map((command) => ({
    kind: "command" as const,
    value: command.name,
    description: command.desc,
    score: scoreCommand(command, query),
  }))
    .filter((suggestion) => suggestion.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        COMMANDS.findIndex((command) => command.name === a.value) -
          COMMANDS.findIndex((command) => command.name === b.value),
    );
}

function getModeMatches(query: string): SlashSuggestion[] {
  return MODES.map((modeName) => ({
    kind: "mode" as const,
    value: modeName,
    description: `切换到 ${modeName} 模式`,
    score: scoreText(modeName, query, 100, 90, 60),
  }))
    .filter((suggestion) => suggestion.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        MODES.indexOf(a.value as ChatMode) - MODES.indexOf(b.value as ChatMode),
    );
}

function getUniqueCommand(query: string): SlashCommand | undefined {
  const exact = COMMANDS.find(
    (command) =>
      command.name === query.toLowerCase() ||
      (command.aliases ?? []).some((alias) => alias === query.toLowerCase()),
  );

  if (exact) return exact;

  const prefixMatches = COMMANDS.filter((command) => command.name.startsWith(query.toLowerCase()));
  return prefixMatches.length === 1 ? prefixMatches[0] : undefined;
}

function getCommonPrefix(values: string[]): string {
  if (values.length === 0) return "";

  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix) && prefix) {
      prefix = prefix.slice(0, -1);
    }
  }

  return prefix;
}

function getSafeCommonPrefix(values: string[]): string {
  const prefix = getCommonPrefix(values);
  if (values.length > 1 && values.includes(prefix)) {
    return prefix.slice(0, -1);
  }

  return prefix;
}

export function getSlashCommandSuggestions(line: string): SlashSuggestion[] {
  if (!line.startsWith("/")) return [];

  const commandMatch = /^\/(\S*)(?:\s+(.*))?$/.exec(line);
  if (!commandMatch) return [];

  const commandQuery = commandMatch[1] ?? "";
  const argQuery = commandMatch[2];
  const command = getUniqueCommand(commandQuery);

  if (command?.name === "mode" && argQuery !== undefined) {
    return getModeMatches(argQuery);
  }

  return getCommandMatches(commandQuery);
}

export function getSlashCommandCompletion(line: string): SlashCompletion | null {
  if (!line.startsWith("/")) return null;

  const commandMatch = /^\/(\S*)(?:\s+(.*))?$/.exec(line);
  if (!commandMatch) return null;

  const commandQuery = commandMatch[1] ?? "";
  const argQuery = commandMatch[2];
  const command = getUniqueCommand(commandQuery);

  if (command?.name === "mode" && argQuery !== undefined) {
    const argStart = line.length - argQuery.length;
    const matches = getModeMatches(argQuery);
    if (matches.length === 1) {
      return { start: argStart, end: line.length, replacement: matches[0].value };
    }

    const prefix = getCommonPrefix(matches.map((match) => match.value));
    if (prefix.length > argQuery.length) {
      return { start: argStart, end: line.length, replacement: prefix };
    }

    return null;
  }

  const matches = getCommandMatches(commandQuery);
  if (matches.length === 0) return null;

  if (matches.length === 1) {
    return { start: 1, end: line.length, replacement: `${matches[0].value} ` };
  }

  const commandNameMatches = matches
    .filter(
      (match) => match.kind === "command" && match.value.startsWith(commandQuery.toLowerCase()),
    )
    .map((match) => match.value);
  const prefix = getSafeCommonPrefix(commandNameMatches);

  if (prefix.length > commandQuery.length) {
    return { start: 1, end: line.length, replacement: prefix };
  }

  return null;
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

const CHAT_PROMPT = chalk.dim("│ ") + chalk.cyan("❯ ");
const SUGGESTION_LIMIT = 6;

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
  readline.emitKeypressEvents(process.stdin, rl);

  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(true);
  }

  let renderedSuggestionRows = 0;

  function setChatPrompt(): void {
    rl.setPrompt(CHAT_PROMPT);
  }

  function formatSuggestionRows(line: string): string[] {
    if (!line.startsWith("/")) return [];

    const suggestions = getSlashCommandSuggestions(line).slice(0, SUGGESTION_LIMIT);
    const rows = [
      `${chalk.dim("│ ")}${chalk.gray("命令建议")}${chalk.dim("  Tab 补全，继续输入可缩小范围")}`,
    ];

    if (suggestions.length === 0) {
      rows.push(
        `${chalk.dim("│   ")}${chalk.yellow("无匹配命令")}${chalk.dim("  输入 /help 查看全部命令")}`,
      );
      return rows;
    }

    for (const suggestion of suggestions) {
      const label =
        suggestion.kind === "command" ? `/${suggestion.value}` : `/mode ${suggestion.value}`;
      rows.push(
        `${chalk.dim("│   ")}${chalk.yellow(label.padEnd(14))}${chalk.gray(suggestion.description)}`,
      );
    }

    return rows;
  }

  function updateSuggestionBlock(rows: string[]): void {
    if (!process.stdout.isTTY) {
      renderedSuggestionRows = 0;
      return;
    }

    const rowCount = Math.max(renderedSuggestionRows, rows.length);
    if (rowCount === 0) return;

    process.stdout.write("\x1b[s");
    for (let index = 0; index < rowCount; index++) {
      readline.moveCursor(process.stdout, 0, 1);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      if (index < rows.length) {
        process.stdout.write(rows[index]);
      }
    }
    process.stdout.write("\x1b[u");

    renderedSuggestionRows = rows.length;
  }

  function renderSuggestionBlock(): void {
    updateSuggestionBlock(formatSuggestionRows(rl.line ?? ""));
  }

  function clearSuggestionBlock(): void {
    updateSuggestionBlock([]);
  }

  function replaceInputRange(completion: SlashCompletion): boolean {
    if (rl.cursor !== completion.end) return false;

    for (let index = completion.end; index > completion.start; index--) {
      rl.write(null, { name: "backspace" });
    }
    rl.write(completion.replacement);

    return true;
  }

  function completeSlashInput(): boolean {
    if (rl.cursor !== rl.line.length) return false;

    const completion = getSlashCommandCompletion(rl.line);
    return completion ? replaceInputRange(completion) : false;
  }

  function removeInsertedTab(lineBefore: string, cursorBefore: number): void {
    const expectedLine = `${lineBefore.slice(0, cursorBefore)}\t${lineBefore.slice(cursorBefore)}`;
    if (rl.line === expectedLine && rl.cursor === cursorBefore + 1) {
      rl.write(null, { name: "backspace" });
    }
  }

  function promptNextInput(): void {
    clearSuggestionBlock();
    drawInputFrame(mode);
    setChatPrompt();
    rl.prompt();
    renderSuggestionBlock();
  }

  function cycleMode(): void {
    const idx = MODES.indexOf(mode);
    mode = MODES[(idx + 1) % MODES.length];
    redrawInputFrame(mode);
    setChatPrompt();
    rl.prompt(true);
    renderSuggestionBlock();
  }

  const onKeypress = (_str: string, key: { name?: string; ctrl?: boolean }) => {
    if (key.name === "return" || key.name === "enter" || (key.ctrl && key.name === "c")) {
      clearSuggestionBlock();
      return;
    }

    if (key.name === "tab") {
      const lineBefore = rl.line;
      const cursorBefore = rl.cursor;

      process.nextTick(() => {
        removeInsertedTab(lineBefore, cursorBefore);
        if (completeSlashInput()) {
          renderSuggestionBlock();
          return;
        }
        renderSuggestionBlock();
      });
      return;
    }

    if (key.name === "t" && key.ctrl) {
      cycleMode();
      return;
    }

    process.nextTick(() => {
      renderSuggestionBlock();
    });
  };

  process.stdin.prependListener("keypress", onKeypress);

  rl.on("line", async (input: string) => {
    clearSuggestionBlock();
    const trimmed = input.trim();
    if (!trimmed) {
      promptNextInput();
      return;
    }

    if (trimmed.startsWith("/")) {
      handleSlashCommand(trimmed, {
        messages,
        mode,
        config,
        setMode: (m) => {
          mode = m;
          setChatPrompt();
        },
      });
      promptNextInput();
      return;
    }

    drawUserMessage(trimmed);
    messages.push({ role: "user", content: trimmed });

    const spinner = ora({ text: "AI 思考中...", color: "cyan" }).start();

    try {
      const maxIterations = 50;
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;
        if (iteration > 1) {
          spinner.text = `AI 执行中... (第 ${iteration - 1} 步)`;
          spinner.start();
        }

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
          continue;
        }

        if (response.content) {
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

        break;
      }

      if (iteration >= maxIterations) {
        console.log(chalk.yellow("\n⚠ 已达到最大执行步数限制，可能未完全执行。"));
      }
    } catch (error) {
      spinner.stop();
      displayError(error);
    }

    promptNextInput();
  });

  promptNextInput();

  rl.on("close", () => {
    process.stdin.removeListener("keypress", onKeypress);
    clearSuggestionBlock();
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(false);
    }
    console.log();
    process.exit(0);
  });
}
