import { randomUUID } from "node:crypto";
import * as readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import { CostTracker, formatCostSnapshot } from "../llm/cost-tracker.js";
import type { LLMProvider } from "../llm/provider.js";
import { createProviderFromConfig } from "../llm/registry.js";
import { executeApprovedPlan, formatPlanState } from "../modes/plan.js";
import { ModeRouter } from "../modes/router.js";
import { createTaskTiming, formatTaskTiming } from "../session/execution.js";
import { SessionPersistence } from "../session/persistence.js";
import { createSessionSummary, forkSessionState } from "../session/runtime.js";
import { SessionStore } from "../session/store.js";
import { UsageTracker, formatUsageSnapshot } from "../session/usage.js";
import { resolveWorkspace } from "../session/workspace.js";
import { createDefaultToolRegistry } from "../tools/built-in/index.js";
import { MCPServerManager, type MCPSummary } from "../tools/mcp/manager.js";
import type { Config } from "../types/config.js";
import type { ChatMode } from "../types/mode.js";
import type { PlanState } from "../types/plan.js";
import type { LLMMessage, LLMToolCall, LLMUsage } from "../types/provider.js";
import type { SessionState, SessionSummary } from "../types/session.js";
import type { ToolResult } from "../types/tool.js";
import { maskApiKey } from "../utils/api-key.js";
import { formatDuration } from "../utils/format.js";
import { isSensitivePath } from "../utils/security.js";

export { formatTaskTiming } from "../session/execution.js";

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

function formatMCPSummary(summary: MCPSummary): string {
  return `MCP: ${summary.servers} servers / ${summary.tools} tools`;
}

function displayWelcome(config: Config, provider: LLMProvider, mcpSummary: MCPSummary): void {
  const mcpLine = `${chalk.cyan("│")}  ${formatMCPSummary(mcpSummary)}`;
  const providerLabel = config.model?.provider ?? provider.name;

  console.log(`
${chalk.cyan("╭──────────────────────────────────────────────╮")}
${chalk.cyan("│")}            ${chalk.bold("Code Agent CLI  v0.1.0")}             ${chalk.cyan("│")}
${chalk.cyan("│")}             ${chalk.gray("终端原生编码智能体")}                 ${chalk.cyan("│")}
${chalk.cyan("│")}                                              ${chalk.cyan("│")}
${chalk.cyan("│")}  模型: ${chalk.green(providerLabel)}/${chalk.green(config.model?.model ?? "unknown")}
${chalk.cyan("│")}  API: ${chalk.green(maskApiKey(config.model?.apiKey ?? ""))}
${chalk.cyan("│")}  目录: ${chalk.green(process.cwd())}
${mcpLine}
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
const MODE_NAMES: Record<ChatMode, string> = {
  normal: "普通",
  auto: "自动",
  plan: "规划",
  edit: "编辑",
};
const SESSION_STATUS_NAMES: Record<SessionSummary["status"], string> = {
  idle: "空闲",
  running: "执行中",
  awaiting_plan_approval: "等待计划确认",
  interrupted: "已中断",
  archived: "已归档",
};

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
    name: "session",
    desc: "查看当前会话摘要",
    keywords: ["会话", "摘要", "状态", "session"],
  },
  {
    name: "resume",
    desc: "恢复历史会话或查看会话列表",
    keywords: ["恢复", "历史", "会话", "resume"],
  },
  {
    name: "fork",
    desc: "基于当前会话创建分支",
    keywords: ["分支", "fork", "派生", "复制会话"],
  },
  {
    name: "archive",
    desc: "归档当前会话",
    keywords: ["归档", "隐藏会话", "archive"],
  },
  {
    name: "unarchive",
    desc: "取消归档目标会话",
    keywords: ["取消归档", "恢复归档", "unarchive"],
  },
  {
    name: "usage",
    desc: "Show token usage",
    aliases: ["tokens"],
    keywords: ["usage", "token", "tokens"],
  },
  {
    name: "cost",
    desc: "查看费用统计",
    aliases: ["bill"],
    keywords: ["cost", "费用", "账单", "price"],
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

function getModeName(mode: ChatMode): string {
  return MODE_NAMES[mode];
}

function getSessionStatusName(status: SessionSummary["status"]): string {
  return SESSION_STATUS_NAMES[status];
}

function logResumedSession(title: string): void {
  console.log(chalk.green(`已恢复会话：${title}`));
}

function logForkedSession(title: string): void {
  console.log(chalk.green(`已基于会话派生新分支：${title}`));
}

function logInterruptedSessionRestored(): void {
  console.log(chalk.yellow("已恢复中断会话，请确认上下文后继续。"));
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

function getExecutableCommandName(commandName: string): string {
  const lower = commandName.toLowerCase();
  const exact = COMMANDS.find(
    (command) => command.name === lower || (command.aliases ?? []).some((alias) => alias === lower),
  );

  return exact?.name ?? lower;
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

  if (commandNameMatches.length === 1) {
    return { start: 1, end: line.length, replacement: `${commandNameMatches[0]} ` };
  }

  const prefix = getSafeCommonPrefix(commandNameMatches);

  if (prefix.length > commandQuery.length) {
    return { start: 1, end: line.length, replacement: prefix };
  }

  return null;
}

async function handleSlashCommand(
  input: string,
  ctx: {
    messages: LLMMessage[];
    mode: ChatMode;
    config: Config;
    usageTracker: UsageTracker;
    costTracker: CostTracker;
    setMode: (m: ChatMode) => void;
    clearPendingPlan?: () => void;
    onSessionUpdated?: (reason?: string) => Promise<void> | void;
    showSession?: () => Promise<void> | void;
    resumeSession?: (query?: string) => Promise<void> | void;
    forkSession?: (name?: string) => Promise<void> | void;
    archiveSession?: () => Promise<void> | void;
    unarchiveSession?: (query: string) => Promise<void> | void;
    onExit?: (code: number) => Promise<void> | void;
  },
): Promise<"continue" | "exit"> {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const executableCommand = getExecutableCommandName(cmd);

  switch (executableCommand) {
    case "help":
      console.log(`
${chalk.bold("可用命令:")}
  ${chalk.yellow("/model")}          查看当前模型
  ${chalk.yellow("/mode <mode>")}    切换模式 (normal/auto/plan/edit)
  ${chalk.yellow("/session")}        查看当前会话摘要
  ${chalk.yellow("/resume [query]")} 恢复历史会话或查看列表
  ${chalk.yellow("/fork [name]")}    基于当前会话创建分支
  ${chalk.yellow("/archive")}        归档当前会话
  ${chalk.yellow("/unarchive <q>")}  取消归档目标会话
  ${chalk.yellow("/clear")}          清空对话历史
  ${chalk.yellow("/usage")}         Show token usage
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
        await ctx.onSessionUpdated?.("mode");
        console.log(chalk.green(`切换到模式: ${args[0]}`));
      } else {
        console.log(chalk.yellow(`当前模式: ${ctx.mode}`));
      }
      break;

    case "clear":
      ctx.messages.length = 0;
      ctx.clearPendingPlan?.();
      await ctx.onSessionUpdated?.("clear");
      console.log(chalk.green("对话历史已清空"));
      break;

    case "session":
      if (ctx.showSession) {
        await ctx.showSession();
      } else {
        console.log(chalk.yellow("当前没有会话信息"));
      }
      break;

    case "resume":
      if (ctx.resumeSession) {
        await ctx.resumeSession(args.join(" ").trim() || undefined);
      } else {
        console.log(chalk.yellow("当前不支持恢复会话"));
      }
      break;

    case "fork":
      if (ctx.forkSession) {
        await ctx.forkSession(args.join(" ").trim() || undefined);
      } else {
        console.log(chalk.yellow("当前不支持创建会话分支"));
      }
      break;

    case "archive":
      if (ctx.archiveSession) {
        await ctx.archiveSession();
      } else {
        console.log(chalk.yellow("当前没有可归档的会话"));
      }
      break;

    case "unarchive":
      if (!args.length) {
        console.log(chalk.yellow("请提供要取消归档的会话编号或标题前缀"));
        break;
      }
      if (ctx.unarchiveSession) {
        await ctx.unarchiveSession(args.join(" ").trim());
      } else {
        console.log(chalk.yellow("当前不支持取消归档会话"));
      }
      break;

    case "usage":
      console.log(
        chalk.yellow(
          formatUsageSnapshot(ctx.usageTracker.snapshot(), ctx.config.model?.model ?? "unknown"),
        ),
      );
      break;

    case "cost":
      console.log(chalk.yellow(formatCostSnapshot(ctx.costTracker.snapshot())));
      break;

    case "exit":
      if (ctx.onExit) {
        await ctx.onExit(0);
      } else {
        process.exit(0);
      }
      return "exit";

    default:
      console.log(chalk.yellow(`未知命令: /${cmd}。输入 /help 查看可用命令`));
  }

  return "continue";
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

function printTokenUsage(usage: LLMUsage): void {
  console.log(chalk.gray(`Token: input ${usage.promptTokens} / output ${usage.completionTokens}`));
}

function printToolStart(toolCall: LLMToolCall): void {
  console.log(chalk.cyan(`\n---- Tool call: ${toolCall.name} ----`));
  console.log(chalk.gray(`Args: ${JSON.stringify(toolCall.args, null, 2)}`));
}

function printToolResult(toolCall: LLMToolCall, result: ToolResult, elapsedMs: number): void {
  if (result.success) {
    console.log(chalk.green(`Success: ${toolCall.name} (${formatDuration(elapsedMs)})`));
    if (result.metadata?.diff) {
      console.log(chalk.gray("Diff:"));
      console.log(result.metadata.diff);
    }
    return;
  }

  console.log(
    chalk.red(`Failed: ${toolCall.name} (${formatDuration(elapsedMs)}): ${result.error}`),
  );
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

function isPlanApprovalInput(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return ["y", "yes", "确认", "执行", "继续"].includes(normalized);
}

function isPlanRejectInput(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return ["n", "no", "取消", "停止"].includes(normalized);
}

function printPlanState(plan: PlanState): void {
  const header = chalk.dim("─── PLAN ──────────────────────────────────────");
  const footer = chalk.dim("────────────────────────────────────────────────");
  console.log(`\n${header}\n${formatPlanState(plan)}\n${footer}\n`);
}

function formatPlanProgress(plan: PlanState): string {
  const total = plan.steps.length;
  const done = plan.steps.filter((step) => step.status === "done").length;
  const runningIndex = plan.steps.findIndex((step) => step.status === "running");

  if (runningIndex >= 0) {
    return `Plan step ${runningIndex + 1}/${total}: ${plan.steps[runningIndex].title}`;
  }

  const failedIndex = plan.steps.findIndex((step) => step.status === "failed");
  if (failedIndex >= 0) {
    return `Plan failed at ${failedIndex + 1}/${total}: ${plan.steps[failedIndex].title}`;
  }

  return `Plan progress: ${done}/${total} steps completed`;
}

function createProviderOrExit(config: Config): LLMProvider | null {
  try {
    return createProviderFromConfig(config);
  } catch (error) {
    displayError(error);
    process.exit(1);
    return null;
  }
}

export type StartChatOptions = {
  continueLast?: boolean;
  resumeLast?: boolean;
  resumeAll?: boolean;
  resumeQuery?: string;
  resumePicker?: boolean;
  resumeFork?: boolean;
};

type InitialSessionLoadResult = {
  resumedFromInterrupted: boolean;
  session?: SessionState;
  forkedFromTitle?: string;
  notice?: string;
};

type ResolvedSessionLoadResult = {
  session: SessionState;
  resumedFromInterrupted: boolean;
  forkedFromTitle?: string;
};

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError";
  }

  return false;
}

function normalizeInterruptedSession(state: SessionState): ResolvedSessionLoadResult {
  if (state.status !== "interrupted") {
    return {
      session: state,
      resumedFromInterrupted: false,
    };
  }

  const normalized = structuredClone(state);
  normalized.status = "idle";

  if (normalized.pendingPlan) {
    for (const step of normalized.pendingPlan.steps) {
      if (step.status === "running") {
        step.status = "pending";
        step.error = undefined;
      }
    }
  }

  return {
    session: normalized,
    resumedFromInterrupted: true,
  };
}

function formatSessionListRow(summary: SessionSummary, index: number): string {
  return [
    `${index + 1}.`,
    summary.title,
    `状态：${getSessionStatusName(summary.status)}`,
    `模式：${getModeName(summary.mode)}`,
    `最后活跃：${summary.lastActiveAt}`,
  ].join("  ");
}

function printSessionList(summaries: SessionSummary[], limit = 10): void {
  for (const [index, summary] of summaries.slice(0, limit).entries()) {
    console.log(formatSessionListRow(summary, index));
  }
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function forkLoadedSession(
  store: SessionStore,
  source: SessionState,
): Promise<SessionState> {
  const now = new Date().toISOString();
  const forked = forkSessionState(source, {
    sessionId: randomUUID(),
    now,
  });

  await store.saveSession(forked);
  await store.appendEvent(forked.sessionId, {
    type: "fork",
    createdAt: now,
    parentSessionId: source.sessionId,
  });

  return forked;
}

async function resolveSessionSummaryState(
  store: SessionStore,
  summary: SessionSummary,
  options: Pick<StartChatOptions, "resumeFork">,
): Promise<ResolvedSessionLoadResult | undefined> {
  const state = await store.loadSession(summary.id);
  if (!state) {
    return undefined;
  }

  const normalized = normalizeInterruptedSession(state);
  if (!options.resumeFork) {
    return normalized;
  }

  const forked = await forkLoadedSession(store, normalized.session);
  return {
    session: forked,
    resumedFromInterrupted: normalized.resumedFromInterrupted,
    forkedFromTitle: state.title,
  };
}

async function loadInitialSession(
  config: Config,
  options: StartChatOptions,
): Promise<InitialSessionLoadResult | undefined> {
  if (!config.sessions?.enabled || !config.sessions.storePath) {
    return undefined;
  }

  if (options.resumePicker) {
    return undefined;
  }

  if (!options.continueLast && !options.resumeLast && !options.resumeQuery) {
    return undefined;
  }

  const workspace = await resolveWorkspace(process.cwd());
  const store = new SessionStore(config.sessions.storePath);
  const queryOptions = {
    workspaceKey: workspace.key,
    kind: "interactive" as const,
    includeAllWorkspaces: Boolean(options.resumeAll),
  };

  const summary = options.resumeQuery
    ? await store.findSessionByQuery(options.resumeQuery, queryOptions)
    : await store.findLatestSession(queryOptions);

  if (!summary) {
    if (options.resumeQuery) {
      return {
        resumedFromInterrupted: false,
        notice: `未找到会话：${options.resumeQuery}，将开始新会话。`,
      };
    }

    if (options.continueLast || options.resumeLast) {
      return {
        resumedFromInterrupted: false,
        notice: "当前工作区没有可恢复的会话，将开始新会话。",
      };
    }

    return undefined;
  }

  return resolveSessionSummaryState(store, summary, options);
}

export async function runPrompt(config: Config, prompt: string): Promise<void> {
  const provider = createProviderOrExit(config);
  if (!provider) {
    return;
  }
  const toolRegistry = createDefaultToolRegistry();
  const mcpManager = new MCPServerManager(config.mcpServers, toolRegistry, {
    onWarning: (message) => {
      console.log(chalk.yellow(`\n${message}`));
    },
  });
  const messages: LLMMessage[] = [];
  const timing = createTaskTiming();
  const usageTracker = new UsageTracker();
  const costTracker = new CostTracker(config.costGuard);
  const modeRouter = new ModeRouter();
  let mode: ChatMode = (config.mode as ChatMode) ?? "normal";
  let pendingPlan: PlanState | undefined;
  const handler = modeRouter.getHandler(mode);
  const persistence = new SessionPersistence({
    enabled: config.sessions?.enabled !== false,
    storePath: config.sessions?.storePath,
    kind: "prompt",
    usageTracker,
    costTracker,
    getMode: () => mode,
    getMessages: () => messages,
    getPendingPlan: () => pendingPlan,
  });

  try {
    await persistence.initialize();
    await mcpManager.startAll();
    await persistence.updateStatus("running");

    const runContext = {
      provider,
      toolRegistry,
      messages,
      config,
      usageTracker,
      costTracker,
      timing,
      skipConfirm: Boolean(config.yolo),
      confirmToolCall: async () => false,
      onMessagesChanged: (nextMessages: LLMMessage[]) => persistence.handleMessagesChanged(nextMessages),
      onPlanStateChanged: (plan?: PlanState) => persistence.handlePlanStateChanged(plan),
      onStatusChanged: (status: "idle" | "running" | "awaiting_plan_approval" | "interrupted" | "archived", reason?: string) =>
        persistence.updateStatus(status, reason),
      output: {
        onAssistantMessage: (content: string) => {
          console.log(content);
        },
        onTokenUsage: printTokenUsage,
        onToolStart: printToolStart,
        onToolResult: printToolResult,
        onWarning: (message: string) => {
          console.log(chalk.yellow(`\n${message}`));
        },
        onPlanState: printPlanState,
      },
    };

    const modeResult = await handler.run(prompt, runContext);

    if (modeResult.planState) {
      pendingPlan = modeResult.planState;
      if (config.yolo) {
        await persistence.updateStatus("running");
        await executeApprovedPlan(
          modeResult.planState,
          {
            ...runContext,
            skipConfirm: true,
            confirmToolCall: async () => true,
          },
          handler.maxIterations,
        );
        pendingPlan = undefined;
        await persistence.handlePlanStateChanged(undefined);
        await persistence.updateStatus("idle");
      } else {
        await persistence.updateStatus("awaiting_plan_approval");
        console.log(
          chalk.yellow("Plan generated. Re-run with --yolo or use interactive chat to execute it."),
        );
      }
    } else {
      await persistence.updateStatus("idle");
    }
  } catch (error) {
    displayError(error);
  } finally {
    await mcpManager.stopAll();
  }

  console.log(chalk.gray(formatTaskTiming(timing)));
}

export async function startChat(
  config: Config,
  options: StartChatOptions = {},
): Promise<void> {
  if (!config.model?.apiKey && !config.models && config.model?.provider !== "ollama") {
    console.error(chalk.red("API Key 未配置。请运行 code-agent init 初始化配置。"));
    process.exit(1);
    return;
  }

  const provider = createProviderOrExit(config);
  if (!provider) {
    return;
  }
  const toolRegistry = createDefaultToolRegistry();
  const mcpManager = new MCPServerManager(config.mcpServers, toolRegistry, {
    onWarning: (message) => {
      console.log(chalk.yellow(message));
    },
  });
  const initialSessionLoad = await loadInitialSession(config, options);
  const initialSession = initialSessionLoad?.session;
  const messages: LLMMessage[] = initialSession ? [...initialSession.messages] : [];
  const usageTracker = new UsageTracker(initialSession?.usage);
  const costTracker = new CostTracker(config.costGuard, initialSession?.cost);
  const modeRouter = new ModeRouter();
  let mode: ChatMode = initialSession?.mode ?? ((config.mode as ChatMode) ?? "normal");
  let pendingPlan: PlanState | undefined = initialSession?.pendingPlan;
  const sessionStore =
    config.sessions?.enabled !== false && config.sessions?.storePath
      ? new SessionStore(config.sessions.storePath)
      : undefined;
  const persistence = new SessionPersistence({
    enabled: config.sessions?.enabled !== false,
    storePath: config.sessions?.storePath,
    kind: "interactive",
    usageTracker,
    costTracker,
    getMode: () => mode,
    getMessages: () => messages,
    getPendingPlan: () => pendingPlan,
  });
  type KeypressListener = (str: string, key: { name?: string; ctrl?: boolean }) => void;
  const cleanupHooks: {
    clearSuggestionBlock?: () => void;
    keypressListener?: KeypressListener;
    readline?: readline.Interface;
    readlineClosing: boolean;
    readlineClosed: boolean;
  } = {
    readlineClosing: false,
    readlineClosed: false,
  };
  let renderedSuggestionRows = 0;
  let keypressListenerAttached = false;
  let rawModeEnabled = false;
  let shutdownPromise: Promise<void> | undefined;
  let exitRequested = false;
  let exitCode = 0;
  let exitHandled = false;
  let activeRun:
    | {
        controller: AbortController;
        spinner: ReturnType<typeof ora>;
        interruptRequested: boolean;
        forceExitRequested: boolean;
      }
    | undefined;

  function resetRuntimeState(): void {
    messages.length = 0;
    pendingPlan = undefined;
    usageTracker.reset();
    costTracker.reset();
  }

  function applySessionState(state: SessionState): void {
    messages.splice(0, messages.length, ...state.messages);
    mode = state.mode;
    pendingPlan = state.pendingPlan;
    usageTracker.restore(state.usage);
    costTracker.restore(state.cost);
    persistence.hydrate(state);
  }

  function printSessionSummary(): void {
    const state = persistence.getCurrentState();
    if (!state) {
      console.log(chalk.yellow("当前还没有活跃会话"));
      return;
    }

    const summary = createSessionSummary(state);
    console.log(
      [
        `会话编号：${summary.id}`,
        `标题：${summary.title}`,
        `状态：${getSessionStatusName(summary.status)}`,
        `模式：${getModeName(summary.mode)}`,
        `工作区：${summary.workspacePath}`,
        `轮次：${summary.turnCount}`,
      ].join("\n"),
    );
  }

  async function restoreSessionSummary(summary: SessionSummary, announce = true): Promise<boolean> {
    if (!sessionStore) {
      return false;
    }

    const resolved = await resolveSessionSummaryState(sessionStore, summary, {
      resumeFork: false,
    });
    if (!resolved) {
      return false;
    }

    applySessionState(resolved.session);

    if (announce) {
      logResumedSession(summary.title);
      if (resolved.resumedFromInterrupted) {
        logInterruptedSessionRestored();
      }
    }

    return true;
  }

  async function runResumePicker(): Promise<void> {
    if (!options.resumePicker || !sessionStore) {
      return;
    }

    const workspace = await resolveWorkspace(process.cwd());
    const sessions = await sessionStore.listSessions({
      workspaceKey: options.resumeAll ? undefined : workspace.key,
      kind: "interactive",
    });

    if (sessions.length === 0) {
      console.log(chalk.yellow("当前没有可恢复的会话"));
      return;
    }

    printSessionList(sessions);
    const answer = (
      await askQuestion(rl, "请选择要恢复的会话编号（直接回车取消）：")
    ).trim();

    if (!answer) {
      console.log(chalk.yellow("已取消恢复会话"));
      return;
    }

    const selection = Number.parseInt(answer, 10);
    const maxSelection = Math.min(sessions.length, 10);
    if (!Number.isInteger(selection) || selection < 1 || selection > maxSelection) {
      console.log(chalk.yellow(`无效的会话编号：${answer}`));
      return;
    }

    const summary = sessions[selection - 1];
    const resolved = await resolveSessionSummaryState(sessionStore, summary, options);
    if (!resolved) {
      console.log(chalk.yellow(`无法加载会话：${summary.id}`));
      return;
    }

    applySessionState(resolved.session);
    if (resolved.forkedFromTitle) {
      logForkedSession(resolved.forkedFromTitle);
    } else {
      logResumedSession(summary.title);
    }
    if (resolved.resumedFromInterrupted) {
      logInterruptedSessionRestored();
    }
  }

  async function resumeSessionFromSlash(query?: string): Promise<void> {
    if (!sessionStore) {
      console.log(chalk.yellow("会话持久化未启用"));
      return;
    }

    const workspace = await resolveWorkspace(process.cwd());
    if (!query) {
      const sessions = await sessionStore.listSessions({
        workspaceKey: workspace.key,
        kind: "interactive",
      });

      if (sessions.length === 0) {
        console.log(chalk.yellow("当前工作区没有可恢复的会话"));
        return;
      }

      printSessionList(sessions);
      return;
    }

    const summary = await sessionStore.findSessionByQuery(query, {
      workspaceKey: workspace.key,
      kind: "interactive",
    });

    if (!summary) {
      console.log(chalk.yellow(`未找到会话：${query}`));
      return;
    }

    const restored = await restoreSessionSummary(summary, false);
    if (!restored) {
      console.log(chalk.yellow(`无法加载会话：${summary.id}`));
      return;
    }

    logResumedSession(summary.title);
  }

  async function archiveCurrentSession(): Promise<void> {
    const archived = await persistence.archiveCurrentSession();
    if (!archived) {
      console.log(chalk.yellow("当前没有可归档的会话"));
      return;
    }

    resetRuntimeState();
    console.log(chalk.green(`已归档当前会话：${archived.title}`));
  }

  async function forkCurrentSession(name?: string): Promise<void> {
    const forked = await persistence.forkCurrentSession(name);
    if (!forked) {
      console.log(chalk.yellow("当前没有可分叉的会话"));
      return;
    }

    messages.splice(0, messages.length, ...forked.messages);
    pendingPlan = forked.pendingPlan;
    usageTracker.restore(forked.usage);
    costTracker.restore(forked.cost);
    mode = forked.mode;
    console.log(chalk.green(`已创建会话分支：${forked.title}`));
  }

  async function unarchiveSession(query: string): Promise<void> {
    if (!sessionStore) {
      console.log(chalk.yellow("会话持久化未启用"));
      return;
    }

    const workspace = await resolveWorkspace(process.cwd());
    const summary = await sessionStore.findSessionByQuery(query, {
      workspaceKey: workspace.key,
      kind: "interactive",
      includeArchived: true,
    });

    if (!summary || summary.status !== "archived") {
      console.log(chalk.yellow(`未找到已归档会话：${query}`));
      return;
    }

    await sessionStore.setArchiveState(summary.id, false, new Date().toISOString());
    console.log(chalk.green(`已取消归档: ${summary.title}`));
  }

  function logCleanupError(action: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Cleanup failed during ${action}: ${message}`));
  }

  async function shutdown(options: { exit?: boolean; exitCode?: number } = {}): Promise<void> {
    if (options.exit) {
      exitRequested = true;
      exitCode = options.exitCode ?? 0;
    }

    if (!shutdownPromise) {
      shutdownPromise = Promise.resolve().then(async () => {
        if (keypressListenerAttached && cleanupHooks.keypressListener) {
          try {
            process.stdin.removeListener("keypress", cleanupHooks.keypressListener);
          } catch (error) {
            logCleanupError("keypress listener removal", error);
          } finally {
            keypressListenerAttached = false;
          }
        }

        if (cleanupHooks.clearSuggestionBlock) {
          try {
            cleanupHooks.clearSuggestionBlock();
          } catch (error) {
            logCleanupError("suggestion cleanup", error);
          }
        }

        if (
          rawModeEnabled &&
          process.stdin.isTTY &&
          typeof process.stdin.setRawMode === "function"
        ) {
          try {
            process.stdin.setRawMode(false);
          } catch (error) {
            logCleanupError("raw mode restore", error);
          } finally {
            rawModeEnabled = false;
          }
        }

        if (
          cleanupHooks.readline &&
          !cleanupHooks.readlineClosed &&
          !cleanupHooks.readlineClosing
        ) {
          cleanupHooks.readlineClosing = true;
          try {
            cleanupHooks.readline.close();
          } catch (error) {
            logCleanupError("readline close", error);
          } finally {
            cleanupHooks.readlineClosed = true;
            cleanupHooks.readlineClosing = false;
          }
        }

        try {
          await mcpManager.stopAll();
        } catch (error) {
          logCleanupError("MCP shutdown", error);
        }
      });
    }

    await shutdownPromise;

    if (exitRequested && !exitHandled) {
      exitHandled = true;
      console.log();
      process.exit(exitCode);
    }
  }

  async function runSetup<T>(operation: () => T | Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      await shutdown();
      throw error;
    }
  }

  await persistence.initialize();
  if (initialSession) {
    persistence.hydrate(initialSession);
  }
  await mcpManager.startAll();
  await runSetup(() => displayWelcome(config, provider, mcpManager.getSummary()));

  const rl = await runSetup(() =>
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "",
      terminal: true,
    }),
  );
  cleanupHooks.readline = rl;
  await runSetup(() => readline.emitKeypressEvents(process.stdin, rl));

  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    await runSetup(() => {
      process.stdin.setRawMode(true);
      rawModeEnabled = true;
    });
  }

  function setChatPrompt(): void {
    rl.setPrompt(CHAT_PROMPT);
  }

  function setMode(nextMode: ChatMode): void {
    mode = nextMode;
    if (nextMode !== "plan") {
      pendingPlan = undefined;
    }
  }

  async function resetInterruptedPlanState(): Promise<void> {
    if (!pendingPlan) {
      return;
    }

    let changed = false;
    for (const step of pendingPlan.steps) {
      if (step.status === "running") {
        step.status = "pending";
        step.error = undefined;
        changed = true;
      }
    }

    if (changed) {
      await persistence.handlePlanStateChanged(pendingPlan);
    }
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
  cleanupHooks.clearSuggestionBlock = clearSuggestionBlock;

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
    setMode(MODES[(idx + 1) % MODES.length]);
    redrawInputFrame(mode);
    setChatPrompt();
    rl.prompt(true);
    renderSuggestionBlock();
  }

  function requestActiveRunInterrupt(): void {
    if (!activeRun) {
      return;
    }

    if (activeRun.interruptRequested) {
      if (activeRun.forceExitRequested) {
        return;
      }

      activeRun.forceExitRequested = true;
      exitRequested = true;
      exitCode = 130;
      activeRun.spinner.stop();
      console.log(chalk.yellow("再次收到中断信号，已持久化会话状态，正在退出。"));
      void persistence
        .updateStatus("interrupted", "ctrl_c")
        .catch(() => undefined)
        .finally(() => {
          void shutdown({ exit: true, exitCode: 130 });
        });
      return;
    }

    activeRun.interruptRequested = true;
    activeRun.controller.abort();
  }

  const onKeypress: KeypressListener = (_str, key) => {
    if (key.ctrl && key.name === "c") {
      clearSuggestionBlock();
      if (activeRun) {
        requestActiveRunInterrupt();
      }
      return;
    }

    if (key.name === "return" || key.name === "enter") {
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
  cleanupHooks.keypressListener = onKeypress;

  await runSetup(() => {
    process.stdin.prependListener("keypress", onKeypress);
    keypressListenerAttached = true;
  });

  await runSetup(() => {
    rl.on("line", async (input: string) => {
      clearSuggestionBlock();
      const trimmed = input.trim();
      if (!trimmed) {
        promptNextInput();
        return;
      }

      if (trimmed.startsWith("/")) {
        const commandResult = await handleSlashCommand(trimmed, {
          messages,
          mode,
          config,
          usageTracker,
          costTracker,
          setMode: (m) => {
            setMode(m);
            setChatPrompt();
          },
          clearPendingPlan: () => {
            pendingPlan = undefined;
          },
          onSessionUpdated: (reason) => persistence.handleSessionUpdated(reason),
          showSession: () => printSessionSummary(),
          resumeSession: (query) => resumeSessionFromSlash(query),
          forkSession: (name) => forkCurrentSession(name),
          archiveSession: () => archiveCurrentSession(),
          unarchiveSession: (query) => unarchiveSession(query),
          onExit: (code) => shutdown({ exit: true, exitCode: code }),
        });
        if (commandResult === "exit") {
          return;
        }
        promptNextInput();
        return;
      }

      const timing = createTaskTiming();
      const spinner = ora({ text: "AI thinking...", color: "cyan" }).start();
      const handler = modeRouter.getHandler(mode);
      const abortController = new AbortController();
      activeRun = {
        controller: abortController,
        spinner,
        interruptRequested: false,
        forceExitRequested: false,
      };
      await persistence.updateStatus("running");
      const runContext = {
        provider,
        toolRegistry,
        messages,
        config,
        usageTracker,
        costTracker,
        timing,
        abortSignal: abortController.signal,
        skipConfirm: Boolean(config.yolo),
        confirmToolCall: (toolCall: LLMToolCall) => userConfirm(toolCall, rl),
        onMessagesChanged: (nextMessages: LLMMessage[]) => persistence.handleMessagesChanged(nextMessages),
        onPlanStateChanged: (plan?: PlanState) => persistence.handlePlanStateChanged(plan),
        onStatusChanged: (status: "idle" | "running" | "awaiting_plan_approval" | "interrupted" | "archived", reason?: string) =>
          persistence.updateStatus(status, reason),
        output: {
          onIteration: (iteration: number) => {
            if (iteration > 1) {
              spinner.text = `AI executing... (step ${iteration - 1})`;
              spinner.start();
            }
          },
          onAssistantMessage: (content: string) => {
            spinner.stop();
            const header = chalk.dim("─── AI ────────────────────────────────────────");
            const footer = chalk.dim("────────────────────────────────────────────────");
            console.log(`\n${header}\n${content}\n${footer}\n`);
          },
          onTokenUsage: (usage: LLMUsage) => {
            spinner.stop();
            printTokenUsage(usage);
          },
          onToolStart: (toolCall: LLMToolCall) => {
            spinner.stop();
            printToolStart(toolCall);
          },
          onToolResult: (toolCall: LLMToolCall, result: ToolResult, elapsedMs: number) => {
            spinner.stop();
            printToolResult(toolCall, result, elapsedMs);
          },
          onWarning: (message: string) => {
            spinner.stop();
            console.log(chalk.yellow(message));
          },
          onPlanState: (plan: PlanState) => {
            spinner.text = formatPlanProgress(plan);
            spinner.start();
          },
        },
      };

      try {
        if (mode === "plan" && pendingPlan) {
          if (isPlanApprovalInput(trimmed)) {
            const approvedPlan = pendingPlan;
            await executeApprovedPlan(approvedPlan, runContext, handler.maxIterations);
            pendingPlan = undefined;
            await persistence.handlePlanStateChanged(undefined);
            await persistence.updateStatus("idle");
          } else if (isPlanRejectInput(trimmed)) {
            pendingPlan = undefined;
            await persistence.handlePlanStateChanged(undefined);
            await persistence.updateStatus("idle");
            spinner.stop();
            console.log(chalk.yellow("已取消当前计划"));
          } else {
            const result = await handler.run(
              `${pendingPlan.originalTask}\n\n用户反馈：${trimmed}`,
              runContext,
            );
            pendingPlan = result.planState;
            await persistence.updateStatus("awaiting_plan_approval");
          }
        } else {
          const result = await handler.run(trimmed, runContext);
          pendingPlan = result.planState;
          await persistence.updateStatus(result.planState ? "awaiting_plan_approval" : "idle");
        }
      } catch (error) {
        if (activeRun?.interruptRequested && isAbortError(error)) {
          await resetInterruptedPlanState();
          await persistence.updateStatus("interrupted", "ctrl_c");
          spinner.stop();
          console.log(chalk.yellow("当前执行已中断，会话已保留，可稍后继续恢复。"));
        } else {
          await persistence.updateStatus("idle");
          spinner.stop();
          displayError(error);
        }
      } finally {
        activeRun = undefined;
        spinner.stop();
      }

      if (exitRequested) {
        return;
      }

      console.log(chalk.gray(formatTaskTiming(timing)));
      promptNextInput();
    });
  });

  await runSetup(() => runResumePicker());

  if (initialSessionLoad?.forkedFromTitle) {
    logForkedSession(initialSessionLoad.forkedFromTitle);
  }
  if (initialSessionLoad?.resumedFromInterrupted) {
    logInterruptedSessionRestored();
  }
  if (initialSessionLoad?.notice) {
    console.log(chalk.yellow(initialSessionLoad.notice));
  }

  await runSetup(() => {
    promptNextInput();
  });

  await runSetup(() => {
    rl.on("close", async () => {
      cleanupHooks.readlineClosed = true;
      cleanupHooks.readlineClosing = false;
      await shutdown({ exit: true, exitCode: 0 });
    });
  });
}
