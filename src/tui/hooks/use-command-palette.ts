/**
 * 命令面板的纯状态逻辑。
 *
 * 这里只维护「打开/查询/选中」这一组可测试的状态机，不接触 React 与键盘。
 * 组件层（`CommandPalette` 组件）复用这些纯函数。
 */

import { SHELL_SLASH_COMMANDS, type ShellSlashCommand } from "../shell/router.js";

export interface PaletteItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  argHint?: string;
}

export interface PaletteState {
  open: boolean;
  query: string;
  selectedIndex: number;
  /** 当前查询下的可见候选项。 */
  items: PaletteItem[];
  /** 全量候选项，作为每次查询的过滤源，避免逐字缩小后无法回退。 */
  source: PaletteItem[];
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
    source: [],
  };
}

/**
 * 打开面板。
 *
 * 传入的 `items` 同时成为可见项与过滤源；省略时取全量命令目录。
 */
export function openPalette(state: PaletteState, items?: PaletteItem[]): PaletteState {
  const source = items ?? (state.source.length > 0 ? state.source : buildPaletteItems());

  return {
    ...state,
    open: true,
    query: "",
    selectedIndex: 0,
    items: [...source],
    source,
  };
}

export function closePalette(state: PaletteState): PaletteState {
  return {
    ...state,
    open: false,
    query: "",
    selectedIndex: 0,
    items: [],
  };
}

export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...items];
  }

  // 同时匹配标签与描述，这样输入「审批」也能命中 /approvals。
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(normalized) ||
      (item.description ?? "").toLowerCase().includes(normalized),
  );
}

export function setPaletteQuery(state: PaletteState, query: string): PaletteState {
  const source = state.source.length > 0 ? state.source : state.items;
  const items = filterPaletteItems(source, query);
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

function toPaletteItem(command: ShellSlashCommand): PaletteItem {
  return {
    id: `command:${command.name}`,
    label: `/${command.name}`,
    value: `/${command.name}`,
    description: command.description,
    argHint: command.argHint,
  };
}

/**
 * 由 slash 命令目录构建面板候选项。
 *
 * 场景不再单独列项——每个场景都有对应的 slash 命令（`/tasks`、`/approvals` …），
 * 单一列表避免了「同一个目的地出现两次」的困惑。
 */
export function buildPaletteItems(
  commands: readonly ShellSlashCommand[] = SHELL_SLASH_COMMANDS,
): PaletteItem[] {
  return commands.map((command) => toPaletteItem(command));
}
