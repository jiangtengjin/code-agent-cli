import { describe, expect, it } from "vitest";
import { detectTerminalCapabilities } from "../../../src/tui/capabilities.js";

describe("detectTerminalCapabilities", () => {
  it("returns plain mode when explicitly requested", () => {
    const capabilities = detectTerminalCapabilities(
      { plainUi: true },
      {
        stdinIsTTY: true,
        stdoutIsTTY: true,
        env: {},
      },
    );

    expect(capabilities).toMatchObject({
      level: "plain",
      supportsAltScreen: false,
      reason: "plain-ui-flag",
    });
  });

  it("returns plain mode for non-tty terminals", () => {
    const capabilities = detectTerminalCapabilities(
      {},
      {
        stdinIsTTY: false,
        stdoutIsTTY: true,
        env: {},
      },
    );

    expect(capabilities).toMatchObject({
      level: "plain",
      isTTY: false,
      supportsColor: false,
      reason: "non-tty",
    });
  });

  it("returns compatible mode when alternate screen is disabled", () => {
    const capabilities = detectTerminalCapabilities(
      { noAltScreen: true },
      {
        stdinIsTTY: true,
        stdoutIsTTY: true,
        env: {},
      },
    );

    expect(capabilities).toMatchObject({
      level: "compatible",
      supportsAltScreen: false,
      reason: "no-alt-screen-flag",
    });
  });

  it("returns full mode for interactive terminals", () => {
    const capabilities = detectTerminalCapabilities(
      {},
      {
        stdinIsTTY: true,
        stdoutIsTTY: true,
        env: { TERM: "xterm-256color" },
      },
    );

    expect(capabilities).toMatchObject({
      level: "full",
      supportsAltScreen: true,
      reason: "interactive-terminal",
    });
  });
});
