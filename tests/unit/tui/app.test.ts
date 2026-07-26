import { render } from "ink-testing-library";
import React from "react";
import { describe, expect, it } from "vitest";
import { TUIApp } from "../../../src/tui/app.js";

describe("TUIApp", () => {
  it("renders the shell foundation and home scene overview", () => {
    const result = render(
      React.createElement(TUIApp, {
        scene: "home",
        capabilities: {
          level: "full",
          isTTY: true,
          supportsAltScreen: true,
          supportsColor: true,
          reason: "interactive-terminal",
        },
      }),
    );

    expect(result.lastFrame()).toContain("Code Agent CLI");
    expect(result.lastFrame()).toContain("Current scene: home");
    expect(result.lastFrame()).toContain("Scenes: home | chat | approvals");
    result.unmount();
  });
});
