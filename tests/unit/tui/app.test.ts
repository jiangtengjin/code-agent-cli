import { render } from "ink-testing-library";
import React from "react";
import { describe, expect, it } from "vitest";
import { createInteractionEvent } from "../../../src/interaction/events.js";
import { TUIApp } from "../../../src/tui/app.js";
import { createInteractionEventAction, createSceneChangedAction } from "../../../src/tui/shell/actions.js";
import { reduceShellState } from "../../../src/tui/shell/reducer.js";
import { createInitialShellState } from "../../../src/tui/shell/state.js";
import { createShellStore } from "../../../src/tui/shell/store.js";

describe("TUIApp", () => {
  it("renders the shell foundation and home overview from shell state", () => {
    const shellState = [
      createInteractionEvent(
        "session.changed",
        {
          summary: {
            id: "session-1",
            kind: "interactive",
            title: "Build unified shell",
            workspaceKey: "workspace-a",
            workspacePath: "D:/JAVA/code-agent-cli",
            status: "running",
            mode: "normal",
            createdAt: "2026-07-26T12:00:00.000Z",
            updatedAt: "2026-07-26T12:01:00.000Z",
            lastActiveAt: "2026-07-26T12:01:00.000Z",
            turnCount: 4,
          },
        },
        "2026-07-26T12:00:30.000Z",
      ),
      createInteractionEvent(
        "message.added",
        {
          message: {
            role: "assistant",
            content: "Rendering the home scene",
          },
        },
        "2026-07-26T12:00:45.000Z",
      ),
      createInteractionEvent(
        "approval.requested",
        {
          request: {
            id: "approval-1",
            toolCall: {
              id: "tool-1",
              name: "write_file",
              args: {},
            },
            title: "Approve write",
            summary: "Write home scene component",
            risk: "medium",
          },
        },
        "2026-07-26T12:01:00.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      createInitialShellState(),
    );

    const result = render(
      React.createElement(TUIApp, {
        capabilities: {
          level: "full",
          isTTY: true,
          supportsAltScreen: true,
          supportsColor: true,
          reason: "interactive-terminal",
        },
        shellState,
      }),
    );

    expect(result.lastFrame()).toContain("Code Agent CLI");
    expect(result.lastFrame()).toContain("Current scene: home");
    expect(result.lastFrame()).toContain("Session: Build unified shell");
    expect(result.lastFrame()).toContain("Pending approvals: 1");
    result.unmount();
  });

  it("renders the chat scene with recent messages and tool activity", () => {
    const shellState = [
      createInteractionEvent(
        "message.added",
        {
          message: {
            role: "user",
            content: "Render the chat scene",
          },
        },
        "2026-07-26T12:02:00.000Z",
      ),
      createInteractionEvent(
        "tool.started",
        {
          toolCall: {
            id: "tool-1",
            name: "shell_command",
            args: {
              command: "pnpm test",
            },
          },
          requiresApproval: false,
        },
        "2026-07-26T12:02:10.000Z",
      ),
      createInteractionEvent(
        "tool.finished",
        {
          toolCall: {
            id: "tool-1",
            name: "shell_command",
            args: {
              command: "pnpm test",
            },
          },
          result: {
            success: true,
          },
        },
        "2026-07-26T12:02:20.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("chat")),
    );

    const result = render(
      React.createElement(TUIApp, {
        capabilities: {
          level: "full",
          isTTY: true,
          supportsAltScreen: true,
          supportsColor: true,
          reason: "interactive-terminal",
        },
        shellState,
      }),
    );

    expect(result.lastFrame()).toContain("Current scene: chat");
    expect(result.lastFrame()).toContain("Chat");
    expect(result.lastFrame()).toContain("user: Render the chat scene");
    expect(result.lastFrame()).toContain("shell_command [completed]");
    result.unmount();
  });

  it("updates the rendered scene when driven by a shell store", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: {
          level: "full",
          isTTY: true,
          supportsAltScreen: true,
          supportsColor: true,
          reason: "interactive-terminal",
        },
        shellStore: store,
      }),
    );

    expect(result.lastFrame()).toContain("Current scene: home");

    store.navigate("chat");
    store.render(
      createInteractionEvent("message.added", {
        message: {
          role: "assistant",
          content: "Store-driven update",
        },
      }),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(result.lastFrame()).toContain("Current scene: chat");
    expect(result.lastFrame()).toContain("assistant: Store-driven update");
    result.unmount();
    store.dispose();
  });
});
