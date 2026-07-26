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
