import type { TUIScene } from "../types.js";

export const SHELL_SCENES: readonly TUIScene[] = [
  "home",
  "chat",
  "approvals",
  "resume",
  "review",
  "settings",
  "mcp",
  "tasks",
];

export const SCENE_LABELS: Record<TUIScene, string> = {
  home: "Home",
  chat: "Chat",
  approvals: "Approvals",
  resume: "Resume",
  review: "Review",
  settings: "Settings",
  mcp: "MCP",
  tasks: "Tasks",
};

const SHELL_SCENE_SET = new Set<string>(SHELL_SCENES);
const SCENE_QUERIES = SHELL_SCENES.map((scene) => ({
  scene,
  queries: [scene, SCENE_LABELS[scene].toLowerCase()],
}));

export function isTUIScene(value: string): value is TUIScene {
  return SHELL_SCENE_SET.has(value);
}

export function normalizeScene(value: string | undefined, fallback: TUIScene = "home"): TUIScene {
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
 * `goto` 在 Shell 层直接处理（场景导航），其余命令由 TUI chat controller 解释。
 * 这里集中维护命令清单，供 Tab 补全与命令面板复用。
 */
export interface ShellSlashCommand {
  name: string;
  description: string;
}

export const SHELL_SLASH_COMMANDS: readonly ShellSlashCommand[] = [
  { name: "goto", description: "Navigate to a scene (e.g. /goto chat)" },
  { name: "mode", description: "Switch chat mode (normal|auto|plan|edit)" },
  { name: "approve", description: "Approve a pending approval" },
  { name: "reject", description: "Reject a pending approval" },
  { name: "resume", description: "Refresh the resume catalog or restore a session" },
  { name: "review", description: "Run the review scanner and surface findings" },
  { name: "config", description: "Edit config draft (save|set|reload)" },
];

const SLASH_COMMAND_NAMES = SHELL_SLASH_COMMANDS.map((command) => command.name);

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

  const commandBody = body.trimStart();
  const matches = SLASH_COMMAND_NAMES.filter((name) => name.startsWith(commandBody));
  if (matches.length !== 1) {
    return undefined;
  }

  return `/${matches[0]} `;
}
