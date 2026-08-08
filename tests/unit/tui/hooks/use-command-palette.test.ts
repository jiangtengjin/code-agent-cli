import { describe, expect, it } from "vitest";
import {
  type PaletteItem,
  buildPaletteItems,
  closePalette,
  createPaletteState,
  filterPaletteItems,
  movePaletteSelection,
  openPalette,
  selectPaletteItem,
  setPaletteQuery,
} from "../../../../src/tui/hooks/use-command-palette.js";
import { SHELL_SLASH_COMMANDS } from "../../../../src/tui/shell/router.js";

const commandItem = (name: string, description?: string): PaletteItem => ({
  id: `command:${name}`,
  label: `/${name}`,
  value: `/${name}`,
  description,
});

describe("createPaletteState", () => {
  it("starts closed with an empty query", () => {
    const state = createPaletteState();
    expect(state.open).toBe(false);
    expect(state.query).toBe("");
    expect(state.selectedIndex).toBe(0);
    expect(state.items).toEqual([]);
    expect(state.source).toEqual([]);
  });
});

describe("openPalette / closePalette", () => {
  it("opens with a clean query and resets selection", () => {
    const state = openPalette(closePalette(createPaletteState()));
    expect(state.open).toBe(true);
    expect(state.query).toBe("");
    expect(state.selectedIndex).toBe(0);
  });

  it("defaults to the full slash command catalog", () => {
    const state = openPalette(createPaletteState());
    expect(state.items).toHaveLength(SHELL_SLASH_COMMANDS.length);
    expect(state.source).toHaveLength(SHELL_SLASH_COMMANDS.length);
  });

  it("closes and clears the query", () => {
    const open = openPalette(createPaletteState());
    const closed = closePalette({ ...open, query: "chat" });
    expect(closed.open).toBe(false);
    expect(closed.query).toBe("");
    expect(closed.selectedIndex).toBe(0);
    expect(closed.items).toEqual([]);
  });

  it("keeps the source so a reopen restores the full list", () => {
    const items = [commandItem("tasks"), commandItem("mcp")];
    const narrowed = setPaletteQuery(openPalette(createPaletteState(), items), "mcp");
    expect(narrowed.items).toHaveLength(1);

    const reopened = openPalette(closePalette(narrowed));
    expect(reopened.items).toHaveLength(2);
  });
});

describe("setPaletteQuery", () => {
  it("updates the query and clamps selection back into range", () => {
    const items = [commandItem("chat"), commandItem("tasks")];
    const open = openPalette(createPaletteState(), items);
    const moved = movePaletteSelection(open, "down");
    const queried = setPaletteQuery(moved, "ta");
    expect(queried.query).toBe("ta");
    // filtered list shrinks, selection must stay valid
    expect(queried.selectedIndex).toBeLessThanOrEqual(0);
  });

  it("widens again when the query is deleted", () => {
    // 逐字缩小后必须能回退，否则删字会把候选列表永久锁死。
    const items = [commandItem("review"), commandItem("reject"), commandItem("resume")];
    let state = openPalette(createPaletteState(), items);
    state = setPaletteQuery(state, "rev");
    expect(state.items).toHaveLength(1);
    state = setPaletteQuery(state, "re");
    expect(state.items).toHaveLength(3);
    state = setPaletteQuery(state, "");
    expect(state.items).toHaveLength(3);
  });

  it("matches descriptions so chinese intent words find commands", () => {
    const items = [commandItem("approvals", "打开审批中心"), commandItem("tasks", "打开任务监控")];
    const state = setPaletteQuery(openPalette(createPaletteState(), items), "审批");
    expect(state.items.map((item) => item.value)).toEqual(["/approvals"]);
  });
});

describe("movePaletteSelection", () => {
  const items = [commandItem("chat"), commandItem("tasks"), commandItem("mcp")];

  it("moves down and wraps around", () => {
    let state = openPalette(createPaletteState(), items);
    state = movePaletteSelection(state, "down");
    expect(state.selectedIndex).toBe(1);
    state = movePaletteSelection(state, "down");
    state = movePaletteSelection(state, "down");
    expect(state.selectedIndex).toBe(0);
  });

  it("moves up and wraps around", () => {
    const state = movePaletteSelection(openPalette(createPaletteState(), items), "up");
    expect(state.selectedIndex).toBe(2);
  });

  it("is a noop when the palette has no items", () => {
    const state = openPalette(createPaletteState(), []);
    expect(movePaletteSelection(state, "down").selectedIndex).toBe(0);
  });
});

describe("selectPaletteItem", () => {
  const items = [commandItem("tasks"), commandItem("review")];

  it("returns the item at the active index", () => {
    const state = openPalette(createPaletteState(), items);
    expect(selectPaletteItem(state)?.item.value).toBe("/tasks");
  });

  it("follows the selection", () => {
    const state = movePaletteSelection(openPalette(createPaletteState(), items), "down");
    expect(selectPaletteItem(state)?.item.value).toBe("/review");
  });

  it("returns undefined when there are no items", () => {
    expect(selectPaletteItem(openPalette(createPaletteState(), []))).toBeUndefined();
  });
});

describe("filterPaletteItems", () => {
  const items = [
    commandItem("chat"),
    commandItem("tasks"),
    commandItem("review"),
    commandItem("reject"),
  ];

  it("returns everything for an empty query", () => {
    expect(filterPaletteItems(items, "")).toHaveLength(4);
  });

  it("matches labels case-insensitively", () => {
    const filtered = filterPaletteItems(items, "CHA");
    expect(filtered.map((item) => item.id)).toEqual(["command:chat"]);
  });

  it("matches commands by prefix", () => {
    const filtered = filterPaletteItems(items, "re");
    expect(filtered.map((item) => item.id)).toEqual(["command:review", "command:reject"]);
  });
});

describe("buildPaletteItems", () => {
  it("builds one entry per slash command, carrying description and arg hint", () => {
    const built = buildPaletteItems();
    expect(built).toHaveLength(SHELL_SLASH_COMMANDS.length);

    const modeItem = built.find((item) => item.value === "/mode");
    expect(modeItem).toMatchObject({
      id: "command:mode",
      label: "/mode",
      argHint: "<normal|auto|plan|edit>",
    });
    expect(modeItem?.description).toBeTruthy();
  });

  it("does not list scenes separately from their commands", () => {
    // 每个场景都有自己的 slash 命令，重复列项只会让同一目的地出现两次。
    const built = buildPaletteItems();
    expect(built.every((item) => item.value.startsWith("/"))).toBe(true);
    expect(new Set(built.map((item) => item.value)).size).toBe(built.length);
  });
});
