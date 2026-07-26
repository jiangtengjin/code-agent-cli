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

export function isTUIScene(value: string): value is TUIScene {
  return SHELL_SCENE_SET.has(value);
}

export function normalizeScene(value: string | undefined, fallback: TUIScene = "home"): TUIScene {
  if (value && isTUIScene(value)) {
    return value;
  }

  return fallback;
}
