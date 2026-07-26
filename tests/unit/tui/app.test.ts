import { render } from "ink-testing-library";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createInteractionEvent } from "../../../src/interaction/events.js";
import { TUIApp } from "../../../src/tui/app.js";
import { createInteractionEventAction, createSceneChangedAction } from "../../../src/tui/shell/actions.js";
import { reduceShellState } from "../../../src/tui/shell/reducer.js";
import { createInitialShellState } from "../../../src/tui/shell/state.js";
import { createShellStore } from "../../../src/tui/shell/store.js";

async function flushInput(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

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
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-1",
            title: "Build shell frame",
            status: "running",
            mode: "normal",
          },
        },
        "2026-07-26T12:01:15.000Z",
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
    expect(result.lastFrame()).toContain("Status");
    expect(result.lastFrame()).toContain("workspace: D:/JAVA/code-agent-cli");
    expect(result.lastFrame()).toContain("Rail");
    expect(result.lastFrame()).toContain("> Home");
    expect(result.lastFrame()).toContain("Inspector");
    expect(result.lastFrame()).toContain("session: Build unified shell");
    expect(result.lastFrame()).toContain("Composer");
    expect(result.lastFrame()).toContain("Type a task or /goto <scene>");
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
    expect(result.lastFrame()).toContain("> Chat");
    expect(result.lastFrame()).toContain("Chat");
    expect(result.lastFrame()).toContain("user: Render the chat scene");
    expect(result.lastFrame()).toContain("shell_command [completed]");
    result.unmount();
  });

  it("renders the tasks scene with grouped task visibility", () => {
    const shellState = [
      createInteractionEvent(
        "session.changed",
        {
          summary: {
            id: "session-6",
            kind: "interactive",
            title: "Task center",
            workspaceKey: "workspace-a",
            workspacePath: "D:/JAVA/code-agent-cli",
            status: "running",
            mode: "normal",
            createdAt: "2026-07-26T16:00:00.000Z",
            updatedAt: "2026-07-26T16:05:00.000Z",
            lastActiveAt: "2026-07-26T16:05:00.000Z",
            turnCount: 2,
          },
        },
        "2026-07-26T16:00:30.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-1",
            title: "Build tasks scene",
            status: "running",
            mode: "normal",
            detail: "Rendering grouped tasks",
          },
        },
        "2026-07-26T16:01:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-2",
            title: "Approve release commit",
            status: "awaiting_approval",
            mode: "normal",
            detail: "Waiting for approval",
          },
        },
        "2026-07-26T16:02:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-3",
            title: "Backfill MCP status",
            status: "pending",
            mode: "normal",
          },
        },
        "2026-07-26T16:03:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-4",
            title: "Fix stale draft restore",
            status: "failed",
            mode: "edit",
            detail: "Patch rejected",
          },
        },
        "2026-07-26T16:04:00.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("tasks")),
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

    expect(result.lastFrame()).toContain("Current scene: tasks");
    expect(result.lastFrame()).toContain("> Tasks");
    expect(result.lastFrame()).toContain("Tasks");
    expect(result.lastFrame()).toContain("Session focus: Task center");
    expect(result.lastFrame()).toContain("Active: 2 | Queued: 1 | Finished: 1");
    expect(result.lastFrame()).toContain("Approve release commit [awaiting_approval]");
    expect(result.lastFrame()).toContain("Backfill MCP status [pending]");
    expect(result.lastFrame()).toContain("Fix stale draft restore [failed]");
    result.unmount();
  });

  it("renders the approvals scene with pending and resolved approval context", () => {
    const shellState = [
      createInteractionEvent(
        "approval.requested",
        {
          request: {
            id: "approval-1",
            toolCall: {
              id: "tool-1",
              name: "write_file",
              args: {
                path: "src/tui/app.tsx",
              },
            },
            title: "Approve write_file",
            summary: "Update the shell renderer",
            risk: "high",
            workingDirectory: "D:/JAVA/code-agent-cli",
          },
        },
        "2026-07-26T16:10:00.000Z",
      ),
      createInteractionEvent(
        "approval.requested",
        {
          request: {
            id: "approval-2",
            toolCall: {
              id: "tool-2",
              name: "git show",
              args: {
                ref: "HEAD",
              },
            },
            title: "Approve git show",
            summary: "Inspect the latest commit",
            risk: "low",
          },
        },
        "2026-07-26T16:11:00.000Z",
      ),
      createInteractionEvent(
        "approval.resolved",
        {
          requestId: "approval-2",
          resolution: "approved",
        },
        "2026-07-26T16:11:30.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("approvals")),
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

    expect(result.lastFrame()).toContain("Current scene: approvals");
    expect(result.lastFrame()).toContain("> Approvals");
    expect(result.lastFrame()).toContain("Approvals");
    expect(result.lastFrame()).toContain("Pending: 1 | Resolved: 1");
    expect(result.lastFrame()).toContain("Approve write_file [pending]");
    expect(result.lastFrame()).toContain("Approve git show [approved]");
    expect(result.lastFrame()).toContain("Update the shell renderer");
    result.unmount();
  });

  it("renders the resume scene with catalog entries and resume context", () => {
    const shellState = [
      createInteractionEvent(
        "resume.catalog.updated",
        {
          catalog: {
            items: [
              {
                id: "session-11",
                title: "Fix auth timeout",
                mode: "plan",
                status: "running",
                updatedAt: "2026-07-26T16:20:00.000Z",
                workspacePath: "D:/JAVA/code-agent-cli",
              },
              {
                id: "session-10",
                title: "Review MCP bootstrap",
                mode: "normal",
                status: "idle",
                updatedAt: "2026-07-26T15:50:00.000Z",
                workspacePath: "D:/JAVA/code-agent-cli",
              },
            ],
          },
        },
        "2026-07-26T16:20:10.000Z",
      ),
      createInteractionEvent(
        "resume.loaded",
        {
          sessionId: "session-11",
          resumedFromInterrupted: true,
        },
        "2026-07-26T16:20:20.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("resume")),
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

    expect(result.lastFrame()).toContain("Current scene: resume");
    expect(result.lastFrame()).toContain("> Resume");
    expect(result.lastFrame()).toContain("Resume");
    expect(result.lastFrame()).toContain("Catalog: 2 sessions");
    expect(result.lastFrame()).toContain("Last resumed: session-11");
    expect(result.lastFrame()).toContain("Fix auth timeout [running]");
    expect(result.lastFrame()).toContain("Review MCP bootstrap [idle]");
    result.unmount();
  });

  it("renders the review scene with severity-first findings", () => {
    const shellState = [
      createInteractionEvent(
        "review.findings.ready",
        {
          findings: [
            {
              id: "finding-1",
              severity: "medium",
              title: "Missing tests",
              summary: "src/tui/app.tsx changed without matching tests",
              filePath: "src/tui/app.tsx",
            },
            {
              id: "finding-2",
              severity: "high",
              title: "Approval stuck",
              summary: "Pending approvals can deadlock the shell",
              filePath: "src/tui/adapters/chat-controller.ts",
              line: 120,
            },
          ],
        },
        "2026-07-26T16:30:00.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("review")),
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

    expect(result.lastFrame()).toContain("Current scene: review");
    expect(result.lastFrame()).toContain("> Review");
    expect(result.lastFrame()).toContain("Review");
    expect(result.lastFrame()).toContain("Findings: 2");
    expect(result.lastFrame()).toContain("Approval stuck [high]");
    expect(result.lastFrame()).toContain("Missing tests [medium]");
    result.unmount();
  });

  it("renders the settings scene with validation and diff context", () => {
    const shellState = [
      createInteractionEvent(
        "config.snapshot.updated",
        {
          snapshot: {
            filePath: "D:/tmp/config.jsonc",
            config: {
              model: {
                provider: "deepseek",
                model: "qwen-plus",
              },
            },
            dirty: true,
            diff: "-    \"model\": \"deepseek-chat\"\n+    \"model\": \"qwen-plus\"",
            updatedAt: "2026-07-26T16:40:00.000Z",
          },
        },
        "2026-07-26T16:40:00.000Z",
      ),
      createInteractionEvent(
        "config.validation.updated",
        {
          validation: {
            status: "invalid",
            issues: [
              {
                path: "model.model",
                message: "Unknown model alias",
                severity: "error",
              },
            ],
          },
        },
        "2026-07-26T16:40:10.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("settings")),
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

    expect(result.lastFrame()).toContain("Current scene: settings");
    expect(result.lastFrame()).toContain("> Settings");
    expect(result.lastFrame()).toContain("Settings");
    expect(result.lastFrame()).toContain("dirty: yes");
    expect(result.lastFrame()).toContain("validation: invalid");
    expect(result.lastFrame()).toContain("Unknown model alias");
    expect(result.lastFrame()).toContain("+    \"model\": \"qwen-plus\"");
    result.unmount();
  });

  it("renders the mcp scene with server health summaries", () => {
    const shellState = [
      createInteractionEvent(
        "mcp.health.updated",
        {
          servers: [
            {
              serverName: "filesystem",
              status: "healthy",
              toolCount: 4,
            },
            {
              serverName: "github",
              status: "degraded",
              toolCount: 2,
              message: "Heartbeat timeout",
            },
          ],
        },
        "2026-07-26T16:50:00.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("mcp")),
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

    expect(result.lastFrame()).toContain("Current scene: mcp");
    expect(result.lastFrame()).toContain("> MCP");
    expect(result.lastFrame()).toContain("MCP");
    expect(result.lastFrame()).toContain("Servers: 2 | Healthy: 1 | Degraded: 1");
    expect(result.lastFrame()).toContain("filesystem [healthy]");
    expect(result.lastFrame()).toContain("github [degraded]");
    expect(result.lastFrame()).toContain("Heartbeat timeout");
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
    await flushInput();

    expect(result.lastFrame()).toContain("Current scene: chat");
    expect(result.lastFrame()).toContain("assistant: Store-driven update");
    result.unmount();
    store.dispose();
  });

  it("captures composer draft input and clears it with escape", async () => {
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

    result.stdin.write("hello tui");
    await flushInput();

    expect(result.lastFrame()).toContain("draft: hello tui");

    result.stdin.write("\u001B");
    await flushInput();

    expect(result.lastFrame()).not.toContain("draft: hello tui");
    result.unmount();
    store.dispose();
  });

  it("routes scenes from the composer with /goto and tab completion", async () => {
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

    result.stdin.write("/goto app");
    result.stdin.write("\t");
    await flushInput();

    expect(result.lastFrame()).toContain("draft: /goto approvals");

    result.stdin.write("\r");
    await flushInput();

    expect(result.lastFrame()).toContain("Current scene: approvals");
    expect(result.lastFrame()).toContain("> Approvals");
    expect(result.lastFrame()).toContain("Pending: 0 | Resolved: 0");
    expect(result.lastFrame()).toContain("No approvals yet");
    expect(result.lastFrame()).not.toContain("draft: /goto approvals");
    result.unmount();
    store.dispose();
  });

  it("submits composer tasks, switches to chat, and clears the draft", async () => {
    const store = createShellStore();
    const onSubmitTask = vi.fn(async () => undefined);
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
        onSubmitTask,
      }),
    );

    result.stdin.write("build unified tui");
    result.stdin.write("\r");
    await flushInput();

    expect(onSubmitTask).toHaveBeenCalledWith("build unified tui");
    expect(result.lastFrame()).toContain("Current scene: chat");
    expect(result.lastFrame()).not.toContain("draft: build unified tui");
    result.unmount();
    store.dispose();
  });

  it("routes generic slash commands through the command bridge", async () => {
    const store = createShellStore();
    const onExecuteCommand = vi.fn(async () => ({
      handled: true,
      note: "mode: plan",
      navigateTo: "chat" as const,
    }));
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
        onExecuteCommand,
      }),
    );

    result.stdin.write("/mode plan");
    result.stdin.write("\r");
    await flushInput();
    await flushInput();

    expect(onExecuteCommand).toHaveBeenCalledWith("/mode plan");
    expect(result.lastFrame()).toContain("Current scene: chat");
    expect(result.lastFrame()).toContain("mode: plan");
    expect(result.lastFrame()).not.toContain("draft: /mode plan");
    result.unmount();
    store.dispose();
  });

  it("restores the draft if a slash command fails", async () => {
    const store = createShellStore();
    const onExecuteCommand = vi.fn(async () => {
      throw new Error("unknown command");
    });
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
        onExecuteCommand,
      }),
    );

    result.stdin.write("/review");
    result.stdin.write("\r");
    await flushInput();
    await flushInput();

    expect(onExecuteCommand).toHaveBeenCalledWith("/review");
    expect(result.lastFrame()).toContain("draft: /review");
    expect(result.lastFrame()).toContain("unknown command");
    result.unmount();
    store.dispose();
  });

  it("restores the submitted draft when task execution fails", async () => {
    const store = createShellStore();
    const onSubmitTask = vi.fn(async () => {
      throw new Error("controller busy");
    });
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
        onSubmitTask,
      }),
    );

    result.stdin.write("retry task");
    result.stdin.write("\r");
    await flushInput();
    await flushInput();

    expect(onSubmitTask).toHaveBeenCalledWith("retry task");
    expect(result.lastFrame()).toContain("draft: retry task");
    expect(result.lastFrame()).toContain("controller busy");
    result.unmount();
    store.dispose();
  });

  it("does not overwrite a new draft if execution fails after the user keeps typing", async () => {
    const store = createShellStore();
    let rejectTask = () => undefined;
    const onSubmitTask = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectTask = () => {
            reject(new Error("controller busy"));
          };
        }),
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
        shellStore: store,
        onSubmitTask,
      }),
    );

    result.stdin.write("retry task");
    result.stdin.write("\r");
    await flushInput();

    result.stdin.write("next task");
    await flushInput();

    rejectTask();
    await flushInput();
    await flushInput();

    expect(result.lastFrame()).toContain("draft: next task");
    expect(result.lastFrame()).toContain("controller busy");
    result.unmount();
    store.dispose();
  });
});
