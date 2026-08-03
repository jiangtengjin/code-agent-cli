/**
 * 命令面板的纯状态逻辑。
 *
 * 这里只维护「打开/查询/选中」这一组可测试的状态机，不接触 React 与键盘。
 * 组件层（`useCommandPalette` hook 与 `CommandPalette` 组件）复用这些纯函数。
 */

import type { ShellSlashCommand } from "../shell/router.js";
import type { TUIScene } from "../types.js";

export type PaletteItemKind = "scene" | "command";

export interface PaletteItem {
  id: string;
  label: string;
  kind: PaletteItemKind;
  value: string;
  description?: string;
}

export interface PaletteState {
  open: boolean;
  query: string;
  selectedIndex: number;
  items: PaletteItem[];
}

export interface PaletteSelection {
  item: PaletteItem;
}

export function createPaletteState(): PaletteState {
  return {
    open: false,
    query: "",
    selectedIndex: 0,
    items: [],
  };
}

export function openPalette(state: PaletteState): PaletteState {
  return {
    ...state,
    open: true,
    query: "",
    selectedIndex: 0,
  };
}

export function closePalette(state: PaletteState): PaletteState {
  return {
    ...state,
    open: false,
    query: "",
    selectedIndex: 0,
  };
}

export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...items];
  }
  return items.filter((item) => item.label.toLowerCase().includes(normalized));
}

export function setPaletteQuery(state: PaletteState, query: string): PaletteState {
  const items = filterPaletteItems(state.items, query);
  return {
    ...state,
    query,
    items,
    selectedIndex: items.length > 0 ? Math.min(state.selectedIndex, items.length - 1) : 0,
  };
}

export function movePaletteSelection(state: PaletteState, direction: "up" | "down"): PaletteState {
  if (state.items.length === 0) {
    return state;
  }

  const lastIndex = state.items.length - 1;
  let next = direction === "down" ? state.selectedIndex + 1 : state.selectedIndex - 1;

  if (next > lastIndex) {
    next = 0;
  } else if (next < 0) {
    next = lastIndex;
  }

  return { ...state, selectedIndex: next };
}

export function selectPaletteItem(state: PaletteState): PaletteSelection | undefined {
  const item = state.items[state.selectedIndex];
  return item ? { item } : undefined;
}

/**
 * 由场景列表与 slash 命令目录构建面板候选项。
 *
 * 场景在前、命令在后，二者来源都是 Shell 层的稳定数据，避免在 hook 内重复构造。
 */
export function buildPaletteItems(
  scenes: readonly TUIScene[],
  labels: Record<TUIScene, string>,
  commands: readonly ShellSlashCommand[],
): PaletteItem[] {
  const sceneItems: PaletteItem[] = scenes.map((scene) => ({
    id: `scene:${scene}`,
    label: labels[scene],
    kind: "scene",
    value: scene,
    description: "navigate",
  }));

  const commandItems: PaletteItem[] = commands.map((command) => ({
    id: `command:${command.name}`,
    label: `/${command.name}`,
    kind: "command",
    value: `/${command.name}`,
    description: command.description,
  }));

  return [...sceneItems, ...commandItems];
}
