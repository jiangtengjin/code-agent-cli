import { render } from "ink-testing-library";
import React from "react";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "../../../../src/tui/components/command-palette.js";
import {
  buildPaletteItems,
  createPaletteState,
  openPalette,
  setPaletteQuery,
} from "../../../../src/tui/hooks/use-command-palette.js";

function buildState(query: string) {
  const state = openPalette(createPaletteState(), buildPaletteItems());
  return setPaletteQuery(state, query);
}

describe("CommandPalette", () => {
  it("renders the whole command catalog for an empty query", () => {
    const state = buildState("");
    const result = render(React.createElement(CommandPalette, { state }));

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("/help");
    expect(frame).toContain("/mode");
    expect(frame).toContain("/goto");
    result.unmount();
  });

  it("shows the hint line and arg hints", () => {
    const state = buildState("mode");
    const result = render(React.createElement(CommandPalette, { state }));

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("<normal|auto|plan|edit>");
    expect(frame).toContain("Enter");
    expect(frame).toContain("Esc");
    result.unmount();
  });

  it("marks only the first item as selected", () => {
    const state = buildState("");
    const result = render(React.createElement(CommandPalette, { state }));

    const frame = result.lastFrame() ?? "";
    const selectedLines = frame.split("\n").filter((line) => line.includes("❯"));
    // 一行是查询提示符，一行是选中项，不该出现第三个光标。
    expect(selectedLines).toHaveLength(2);
    result.unmount();
  });

  it("renders filtered matches for a query", () => {
    const state = buildState("mcp");
    const result = render(React.createElement(CommandPalette, { state }));

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("/mcp");
    expect(frame).not.toContain("/goto");
    result.unmount();
  });

  it("echoes the active query", () => {
    const state = buildState("mcp");
    const result = render(React.createElement(CommandPalette, { state }));

    expect(result.lastFrame() ?? "").toContain("mcp");
    result.unmount();
  });

  it("shows a placeholder prompt when the query is empty", () => {
    const state = buildState("");
    const result = render(React.createElement(CommandPalette, { state }));

    expect(result.lastFrame() ?? "").toContain("输入以筛选命令");
    result.unmount();
  });

  it("shows a no-matches hint when the query filters everything out", () => {
    const state = buildState("zzzz");
    const result = render(React.createElement(CommandPalette, { state }));

    expect(result.lastFrame() ?? "").toContain("无匹配命令");
    result.unmount();
  });
});
