import { describe, expect, it, vi } from "vitest";
import { startInteractiveShell } from "../../../src/tui/bootstrap.js";
import type { Config } from "../../../src/types/config.js";

const config: Config = {
  model: {
    provider: "deepseek",
    model: "deepseek-chat",
    apiKey: "sk-test",
  },
};

describe("startInteractiveShell", () => {
  it("delegates to the legacy chat loop in plain mode", async () => {
    const startPlainChat = vi.fn(async () => undefined);
    const renderApp = vi.fn();

    const result = await startInteractiveShell(
      config,
      {
        plainUi: true,
        continueLast: true,
        initialScene: "chat",
      },
      {
        startPlainChat,
        renderApp,
      },
    );

    expect(startPlainChat).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        plainUi: true,
        continueLast: true,
        initialScene: "chat",
      }),
    );
    expect(renderApp).not.toHaveBeenCalled();
    expect(result.renderer).toBe("plain");
    expect(result.scene).toBe("chat");
  });

  it("renders the ink app when the terminal supports tui mode", async () => {
    const renderApp = vi.fn();
    const startPlainChat = vi.fn();

    const result = await startInteractiveShell(
      config,
      {
        initialScene: "home",
      },
      {
        detectCapabilities: () => ({
          level: "full",
          isTTY: true,
          supportsAltScreen: true,
          supportsColor: true,
          reason: "interactive-terminal",
        }),
        startPlainChat,
        renderApp,
      },
    );

    expect(renderApp).toHaveBeenCalledWith({
      scene: "home",
      capabilities: {
        level: "full",
        isTTY: true,
        supportsAltScreen: true,
        supportsColor: true,
        reason: "interactive-terminal",
      },
    });
    expect(startPlainChat).not.toHaveBeenCalled();
    expect(result.renderer).toBe("ink");
    expect(result.scene).toBe("home");
  });
});
