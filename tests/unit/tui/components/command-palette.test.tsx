import { render } from "ink-testing-library";
import React from "react";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "../../../../src/tui/components/command-palette.js";
import {
  buildPaletteItems,
  createPaletteState,
  filterPaletteItems,
  openPalette,
  setPaletteQuery,
} from "../../../../src/tui/hooks/use-command-palette.js";
import {
  SCENE_LABELS,
  SHELL_SCENES,
  SHELL_SLASH_COMMANDS,
} from "../../../../src/tui/shell/router.js";

function buildState(query: string) {
  const items = buildPaletteItems(SHELL_SCENES, SCENE_LABELS, SHELL_SLASH_COMMANDS);
  const filtered = filterPaletteItems(items, query);
  let state = openPalette(createPaletteState());
  state = { ...state, items };
  return setPaletteQuery(state, query);
}

describe("CommandPalette", () => {
  it("renders all scenes and commands for an empty query", () => {
    const state = buildState("");
    const result = render(React.createElement(CommandPalette, { state }));

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Command Palette");
    expect(frame).toContain("> Home (scene)");
    expect(frame).toContain("/mode (cmd)");
    expect(frame).toContain("/goto (cmd)");
    result.unmount();
  });

  it("highlights only the first item as selected", () => {
    const state = buildState("");
    const result = render(React.createElement(CommandPalette, { state }));

    const frame = result.lastFrame() ?? "";
    // first entry is the Home scene and carries the selection marker
    expect(frame).toContain("> Home (scene)");
    // subsequent entries are not selected
    expect(frame).toContain("  /mode (cmd)");
    result.unmount();
  });

  it("renders filtered matches for a query", () => {
    const state = buildState("cha");
    const result = render(React.createElement(CommandPalette, { state }));

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("> Chat (scene)");
    expect(frame).not.toContain("Tasks");
    result.unmount();
  });

  it("shows a no-matches hint when the query filters everything out", () => {
    const state = buildState("zzzz");
    const result = render(React.createElement(CommandPalette, { state }));

    expect(result.lastFrame() ?? "").toContain("No matches");
    result.unmount();
  });
});
