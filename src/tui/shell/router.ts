import type { TUIPanel, TUIScene } from "../types.js";

/**
 * Shell 场景表。
 *
 * `chat` 是根场景：启动即进入对话，其余场景都是从对话里唤起的工作台。
 * 顺序即 Rail 与 `/help` 的展示顺序，因此把使用频率最高的放在最前。
 */
export const SHELL_SCENES: readonly TUIScene[] = [
  "chat",
  "tasks",
  "approvals",
  "resume",
  "review",
  "settings",
  "mcp",
];

export const ROOT_SCENE: TUIScene = "chat";

export const SCENE_LABELS: Record<TUIScene, string> = {
  chat: "Chat",
  tasks: "Tasks",
  approvals: "Approvals",
  resume: "Resume",
  review: "Review",
  settings: "Settings",
  mcp: "MCP",
};

const SHELL_SCENE_SET = new Set<string>(SHELL_SCENES);
const SCENE_QUERIES = SHELL_SCENES.map((scene) => ({
  scene,
  queries: [scene, SCENE_LABELS[scene].toLowerCase()],
}));

export function isTUIScene(value: string): value is TUIScene {
  return SHELL_SCENE_SET.has(value);
}

export function normalizeScene(
  value: string | undefined,
  fallback: TUIScene = ROOT_SCENE,
): TUIScene {
  if (value && isTUIScene(value)) {
    return value;
  }

  return fallback;
}

export function resolveSceneQuery(value: string | undefined): TUIScene | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const exactMatch = SCENE_QUERIES.find((entry) => entry.queries.includes(normalized));
  if (exactMatch) {
    return exactMatch.scene;
  }

  const prefixMatches = SCENE_QUERIES.filter((entry) =>
    entry.queries.some((query) => query.startsWith(normalized)),
  );

  return prefixMatches.length === 1 ? prefixMatches[0].scene : undefined;
}

export function parseGotoCommand(value: string): TUIScene | undefined {
  const match = /^\/goto\s+(.+)$/u.exec(value.trim());
  if (!match) {
    return undefined;
  }

  return resolveSceneQuery(match[1]);
}

export function completeGotoCommand(value: string): string | undefined {
  const match = /^\/goto\s+(\S*)$/u.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const scene = resolveSceneQuery(match[1]);
  if (!scene) {
    return undefined;
  }

  return `/goto ${scene}`;
}

/**
 * Slash 命令目录。
 *
 * 这是唯一的命令事实来源：`/help` 面板、`/` 内联建议、Tab 补全、命令面板
 * 都从这里读，新增命令只需要在此登记一次。
 *
 * - `scene` 命令由 Shell 层直接导航，不需要往下走 controller。
 * - `panel` 命令打开覆盖在对话之上的临时面板，同样不落到 controller。
 * - 其余命令交给 TUI chat controller 解释执行。
 */
export type ShellCommandGroup = "navigate" | "session" | "system";

export interface ShellSlashCommand {
  name: string;
  description: string;
  group: ShellCommandGroup;
  aliases?: string[];
  /** 中文意图词，让用户可以用「模式」「审批」这类说法搜到命令。 */
  keywords?: string[];
  /** 参数提示，展示在建议列表里，例如 `<normal|auto|plan|edit>`。 */
  argHint?: string;
  /** 该命令直接导航到的场景。 */
  scene?: TUIScene;
  /** 该命令打开的临时面板。 */
  panel?: TUIPanel;
}

export const SHELL_SLASH_COMMANDS: readonly ShellSlashCommand[] = [
  {
    name: "help",
    description: "列出全部命令与快捷键",
    group: "system",
    aliases: ["?", "h"],
    keywords: ["帮助", "命令", "说明", "怎么用"],
    panel: "help",
  },
  {
    name: "status",
    description: "查看会话、用量与费用摘要",
    group: "session",
    aliases: ["session", "usage", "cost"],
    keywords: ["状态", "会话", "用量", "费用", "token"],
    panel: "status",
  },
  {
    name: "mode",
    description: "切换对话模式",
    group: "session",
    argHint: "<normal|auto|plan|edit>",
    keywords: ["模式", "切换", "规划", "编辑", "自动"],
  },
  {
    name: "tasks",
    description: "打开任务监控",
    group: "navigate",
    aliases: ["task"],
    keywords: ["任务", "后台", "进度"],
    scene: "tasks",
  },
  {
    name: "approvals",
    description: "打开审批中心",
    group: "navigate",
    aliases: ["approval"],
    keywords: ["审批", "确认", "风险", "授权"],
    scene: "approvals",
  },
  {
    name: "approve",
    description: "批准一条待审批动作",
    group: "session",
    argHint: "<id>",
    keywords: ["批准", "同意", "放行"],
  },
  {
    name: "reject",
    description: "拒绝一条待审批动作",
    group: "session",
    argHint: "<id>",
    keywords: ["拒绝", "驳回", "取消"],
  },
  {
    name: "resume",
    description: "恢复历史会话，留空则列出会话",
    group: "navigate",
    argHint: "[query]",
    keywords: ["恢复", "历史", "会话", "继续"],
    scene: "resume",
  },
  {
    name: "review",
    description: "运行代码审查并查看结论",
    group: "navigate",
    keywords: ["审查", "评审", "问题", "检查"],
    scene: "review",
  },
  {
    name: "settings",
    description: "打开配置工作台",
    group: "navigate",
    aliases: ["config"],
    argHint: "[save|set|reload]",
    keywords: ["配置", "设置", "模型", "参数"],
    scene: "settings",
  },
  {
    name: "mcp",
    description: "打开 MCP 服务管理",
    group: "navigate",
    keywords: ["mcp", "服务", "工具", "健康"],
    scene: "mcp",
  },
  {
    name: "goto",
    description: "跳转到任意场景",
    group: "system",
    argHint: "<scene>",
    keywords: ["跳转", "切换场景", "导航"],
  },
];

const SLASH_COMMAND_NAMES = SHELL_SLASH_COMMANDS.map((command) => command.name);

/** 补全候选：命令名与别名都可输入，但一律补成规范名，顺带教会用户正名。 */
const SLASH_COMPLETION_CANDIDATES = SHELL_SLASH_COMMANDS.flatMap((command) =>
  [command.name, ...(command.aliases ?? [])].map((token) => ({
    token,
    name: command.name,
  })),
);

export function findShellCommand(name: string): ShellSlashCommand | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return SHELL_SLASH_COMMANDS.find(
    (command) => command.name === normalized || (command.aliases ?? []).includes(normalized),
  );
}

/**
 * Tab 补全 slash 命令。
 *
 * - 仅补全命令名前缀，已带参数（命令名后有空格）则不再补全。
 * - 唯一前缀或精确命中时补全为 `/command `，末尾留空格便于输入参数。
 * - 多义前缀返回 undefined，避免替用户误选。
 * - `/goto` 走场景解析，补全为 `/goto <scene>`。
 *
 * 注意：这里只裁掉前导空白，保留尾随空白——尾随空白是「命令名已输完、
 * 正在输参数」的信号，裁掉会导致 `/mode ` 被错误地再次补全为 `/mode `。
 */
export function completeSlashCommand(value: string): string | undefined {
  if (!value.startsWith("/")) {
    return undefined;
  }

  const body = value.slice(1);

  // /goto 携带场景参数，沿用既有的场景补全逻辑。
  if (body.trimStart().startsWith("goto")) {
    const gotoCompletion = completeGotoCommand(value.trim());
    if (gotoCompletion) {
      return gotoCompletion;
    }
  }

  // 命令名后若已出现空白，说明命令名已完整且在输入参数，不再补全命令名。
  const hasTrailingSpace = /^\S+\s/u.test(body);
  if (hasTrailingSpace) {
    return undefined;
  }

  const commandBody = body.trimStart().toLowerCase();

  // 精确命中（含别名）时补成规范名 + 空格：既让用户接着输参数，
  // 也顺手把 `/config` 纠成 `/settings`，下次就知道正名是什么。
  const exactMatch = SLASH_COMPLETION_CANDIDATES.find(
    (candidate) => candidate.token === commandBody,
  );
  if (exactMatch) {
    return `/${exactMatch.name} `;
  }

  // 按去重后的命令数判断多义：`/appro` 同时命中 approvals 与 approve，
  // 这时不替用户猜；而 `/set` 只命中 settings（名字与别名都算同一条），可以补全。
  const matchedNames = new Set(
    SLASH_COMPLETION_CANDIDATES.filter((candidate) => candidate.token.startsWith(commandBody)).map(
      (candidate) => candidate.name,
    ),
  );
  if (matchedNames.size !== 1) {
    return undefined;
  }

  const [matchedName] = matchedNames;
  return `/${matchedName} `;
}

/**
 * 命令建议排序。
 *
 * 打分规则借用纯文本 CLI 的手感：命令名 > 别名 > 中文意图词 > 描述，
 * 每一档里精确 > 前缀 > 包含。这样 `/mo` 命中 `/mode`，输「模式」也能命中。
 */
export interface ShellCommandSuggestion {
  command: ShellSlashCommand;
  score: number;
}

function scoreText(
  target: string,
  query: string,
  exact: number,
  prefix: number,
  contains: number,
): number {
  if (!query) {
    return 1;
  }

  const normalizedTarget = target.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (normalizedTarget === normalizedQuery) {
    return exact;
  }
  if (normalizedTarget.startsWith(normalizedQuery)) {
    return prefix;
  }
  if (normalizedTarget.includes(normalizedQuery)) {
    return contains;
  }

  return 0;
}

function scoreCommand(command: ShellSlashCommand, query: string): number {
  if (!query) {
    return 1;
  }

  return Math.max(
    scoreText(command.name, query, 100, 90, 60),
    scoreText(command.description, query, 55, 45, 35),
    ...(command.aliases ?? []).map((alias) => scoreText(alias, query, 95, 85, 55)),
    ...(command.keywords ?? []).map((keyword) => scoreText(keyword, query, 80, 70, 50)),
  );
}

/**
 * 为当前草稿给出命令建议。
 *
 * 只在草稿以 `/` 开头且尚未输入参数时给建议——一旦进入参数区，
 * 建议列表就该让位给参数提示，避免把用户正在输入的内容挤走。
 */
export function getCommandSuggestions(draft: string): ShellCommandSuggestion[] {
  if (!draft.startsWith("/")) {
    return [];
  }

  const match = /^\/(\S*)(\s?)/u.exec(draft);
  if (!match) {
    return [];
  }

  // 命令名后已经有空格，说明在输参数，不再给命令级建议。
  if (match[2]) {
    return [];
  }

  return SHELL_SLASH_COMMANDS.map((command) => ({
    command,
    score: scoreCommand(command, match[1] ?? ""),
  }))
    .filter((suggestion) => suggestion.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        SLASH_COMMAND_NAMES.indexOf(left.command.name) -
          SLASH_COMMAND_NAMES.indexOf(right.command.name),
    );
}
