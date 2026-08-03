import { describe, expect, it } from "vitest";
import {
  type PaletteItem,
  closePalette,
  createPaletteState,
  filterPaletteItems,
  movePaletteSelection,
  openPalette,
  selectPaletteItem,
  setPaletteQuery,
} from "../../../../src/tui/hooks/use-command-palette.js";

const sceneItem = (scene: string): PaletteItem => ({
  id: `scene:${scene}`,
  label: scene,
  kind: "scene",
  value: scene,
});

const commandItem = (name: string): PaletteItem => ({
  id: `command:${name}`,
  label: `/${name}`,
  kind: "command",
  value: `/${name}`,
});

describe("createPaletteState", () => {
  it("starts closed with an empty query", () => {
    const state = createPaletteState();
    expect(state.open).toBe(false);
    expect(state.query).toBe("");
    expect(state.selectedIndex).toBe(0);
  });
});

describe("openPalette / closePalette", () => {
  it("opens with a clean query and resets selection", () => {
    const state = openPalette(closePalette(createPaletteState()));
    expect(state.open).toBe(true);
    expect(state.query).toBe("");
    expect(state.selectedIndex).toBe(0);
  });

  it("closes and clears the query", () => {
    const open = openPalette(createPaletteState());
    const closed = closePalette({ ...open, query: "chat" });
    expect(closed.open).toBe(false);
    expect(closed.query).toBe("");
    expect(closed.selectedIndex).toBe(0);
  });
});

describe("setPaletteQuery", () => {
  it("updates the query and clamps selection back into range", () => {
    const items = [sceneItem("chat"), sceneItem("tasks")];
    const open = openPalette(createPaletteState());
    const moved = movePaletteSelection({ ...open, items }, "down");
    const queried = setPaletteQuery({ ...moved, items }, "ta");
    expect(queried.query).toBe("ta");
    // filtered list shrinks, selection must stay valid
    expect(queried.selectedIndex).toBeLessThanOrEqual(0);
  });
});

describe("movePaletteSelection", () => {
  const items = [sceneItem("chat"), sceneItem("tasks"), sceneItem("mcp")];

  it("moves down and wraps around", () => {
    let state = openPalette(createPaletteState());
    state = { ...state, items };
    state = movePaletteSelection(state, "down");
    expect(state.selectedIndex).toBe(1);
    state = movePaletteSelection(state, "down");
    state = movePaletteSelection(state, "down");
    expect(state.selectedIndex).toBe(0);
  });

  it("moves up and wraps around", () => {
    let state = openPalette(createPaletteState());
    state = { ...state, items };
    state = movePaletteSelection(state, "up");
    expect(state.selectedIndex).toBe(2);
  });

  it("is a noop when the palette has no items", () => {
    const state = { ...openPalette(createPaletteState()), items: [] as PaletteItem[] };
    expect(movePaletteSelection(state, "down").selectedIndex).toBe(0);
  });
});

describe("selectPaletteItem", () => {
  const items = [sceneItem("chat"), commandItem("review")];

  it("returns the selected scene item", () => {
    const state = { ...openPalette(createPaletteState()), items };
    const result = selectPaletteItem(state);
    expect(result?.item.value).toBe("chat");
  });

  it("returns the command item at the active index", () => {
    let state = { ...openPalette(createPaletteState()), items };
    state = movePaletteSelection(state, "down");
    const result = selectPaletteItem(state);
    expect(result?.item.value).toBe("/review");
  });

  it("returns undefined when there are no items", () => {
    const state = { ...openPalette(createPaletteState()), items: [] as PaletteItem[] };
    expect(selectPaletteItem(state)).toBeUndefined();
  });
});

describe("filterPaletteItems", () => {
  const items = [
    sceneItem("chat"),
    sceneItem("tasks"),
    commandItem("review"),
    commandItem("reject"),
  ];

  it("returns everything for an empty query", () => {
    expect(filterPaletteItems(items, "")).toHaveLength(4);
  });

  it("matches labels case-insensitively", () => {
    const filtered = filterPaletteItems(items, "CHA");
    expect(filtered.map((item) => item.id)).toEqual(["scene:chat"]);
  });

  it("matches both scenes and commands by prefix", () => {
    const filtered = filterPaletteItems(items, "re");
    expect(filtered.map((item) => item.id)).toEqual(["command:review", "command:reject"]);
  });
});
