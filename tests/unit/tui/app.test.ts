import { render } from "ink-testing-library";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createInteractionEvent } from "../../../src/interaction/events.js";
import { TUIApp } from "../../../src/tui/app.js";
import {
  createInteractionEventAction,
  createSceneChangedAction,
} from "../../../src/tui/shell/actions.js";
import { reduceShellState } from "../../../src/tui/shell/reducer.js";
import { createInitialShellState } from "../../../src/tui/shell/state.js";
import { createShellStore } from "../../../src/tui/shell/store.js";
import type { TerminalCapabilities } from "../../../src/tui/types.js";

const FULL_CAPABILITIES: TerminalCapabilities = {
  level: "full",
  isTTY: true,
  supportsAltScreen: true,
  supportsColor: true,
  reason: "interactive-terminal",
};

async function flushInput(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("TUIApp", () => {
  it("starts in the chat scene and onboards with slash commands", () => {
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellState: createInitialShellState(),
      }),
    );

    const frame = result.lastFrame() ?? "";
    // 根场景就是对话：没有面包屑，正文直接给上手引导。
    expect(frame).toContain("Chat");
    expect(frame).not.toContain("Chat ›");
    expect(frame).toContain("/help");
    expect(frame).toContain("/status");
    expect(frame).toContain("/mode");
    expect(frame).toContain("描述你要做的事，或输入 / 查看命令");
    result.unmount();
  });

  it("renders the status bar from shell state", () => {
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
            mode: "plan",
            createdAt: "2026-07-26T12:00:00.000Z",
            updatedAt: "2026-07-26T12:01:00.000Z",
            lastActiveAt: "2026-07-26T12:01:00.000Z",
            turnCount: 4,
          },
        },
        "2026-07-26T12:00:30.000Z",
      ),
      createInteractionEvent(
        "runtime.usage.updated",
        {
          runtime: {
            modelName: "deepseek-chat",
            usage: {
              promptTokens: 900,
              completionTokens: 300,
              totalTokens: 1200,
              calls: 2,
            },
          },
        },
        "2026-07-26T12:00:40.000Z",
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
            summary: "Write the chat scene component",
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
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("plan");
    expect(frame).toContain("deepseek-chat");
    expect(frame).toContain("running");
    expect(frame).toContain("code-agent-cli");
    expect(frame).toContain("1.2k tok");
    // 需要动作的计数才上状态栏
    expect(frame).toContain("approvals 1");
    expect(frame).toContain("tasks 1");
    result.unmount();
  });

  it("renders the chat transcript as one chronological stream", () => {
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
      createInteractionEvent(
        "message.added",
        {
          message: {
            role: "assistant",
            content: "Tests are green",
          },
        },
        "2026-07-26T12:02:30.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("chat")),
    );

    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Render the chat scene");
    expect(frame).toContain("shell_command");
    expect(frame).toContain("pnpm test");
    expect(frame).toContain("Tests are green");
    // 消息与工具混排，阅读顺序就是发生顺序
    expect(frame.indexOf("Render the chat scene")).toBeLessThan(frame.indexOf("shell_command"));
    expect(frame.indexOf("shell_command")).toBeLessThan(frame.indexOf("Tests are green"));
    result.unmount();
  });

  it("points pending approvals at the approvals command from inside chat", () => {
    const shellState = [
      createInteractionEvent(
        "message.added",
        {
          message: {
            role: "user",
            content: "Commit the work",
          },
        },
        "2026-07-26T12:03:00.000Z",
      ),
      createInteractionEvent(
        "approval.requested",
        {
          request: {
            id: "approval-9",
            toolCall: {
              id: "tool-9",
              name: "git commit",
              args: {},
            },
            title: "Approve commit",
            summary: "Create the commit",
            risk: "high",
          },
        },
        "2026-07-26T12:03:10.000Z",
      ),
    ].reduce(
      (state, event) => reduceShellState(state, createInteractionEventAction(event)),
      createInitialShellState(),
    );

    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    expect(result.lastFrame() ?? "").toContain("/approvals");
    result.unmount();
  });

  it("renders nested scenes with a breadcrumb back to chat", () => {
    const shellState = reduceShellState(
      createInitialShellState(),
      createSceneChangedAction("tasks"),
    );

    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Chat › Tasks");
    expect(frame).toContain("Esc 返回对话");
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
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Chat › Tasks");
    expect(frame).toContain("Session focus: Task center");
    expect(frame).toContain("Active: 2 | Queued: 1 | Finished: 1");
    expect(frame).toContain("Approve release commit [awaiting_approval]");
    expect(frame).toContain("Backfill MCP status [pending]");
    expect(frame).toContain("Fix stale draft restore [failed]");
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
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Chat › Approvals");
    expect(frame).toContain("Pending: 1 | Resolved: 1");
    expect(frame).toContain("Approve write_file [pending]");
    expect(frame).toContain("Approve git show [approved]");
    expect(frame).toContain("Update the shell renderer");
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
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Chat › Resume");
    expect(frame).toContain("Catalog: 2 sessions");
    expect(frame).toContain("Last resumed: session-11");
    expect(frame).toContain("Fix auth timeout [running]");
    expect(frame).toContain("Review MCP bootstrap [idle]");
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
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Chat › Review");
    expect(frame).toContain("Findings: 2");
    expect(frame).toContain("Approval stuck [high]");
    expect(frame).toContain("Missing tests [medium]");
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
            diff: '-    "model": "deepseek-chat"\n+    "model": "qwen-plus"',
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
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Chat › Settings");
    expect(frame).toContain("dirty: yes");
    expect(frame).toContain("validation: invalid");
    expect(frame).toContain("Unknown model alias");
    expect(frame).toContain('+    "model": "qwen-plus"');
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
        capabilities: FULL_CAPABILITIES,
        shellState,
      }),
    );

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Chat › MCP");
    expect(frame).toContain("Servers: 2 | Healthy: 1 | Degraded: 1");
    expect(frame).toContain("filesystem [healthy]");
    expect(frame).toContain("github [degraded]");
    expect(frame).toContain("Heartbeat timeout");
    result.unmount();
  });

  it("updates the rendered scene when driven by a shell store", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
      }),
    );

    expect(result.lastFrame()).not.toContain("Chat ›");

    store.navigate("tasks");
    await flushInput();
    expect(result.lastFrame()).toContain("Chat › Tasks");

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

    expect(result.lastFrame()).not.toContain("Chat ›");
    expect(result.lastFrame()).toContain("Store-driven update");
    result.unmount();
    store.dispose();
  });

  it("captures composer draft input and clears it with escape", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
      }),
    );

    result.stdin.write("hello tui");
    await flushInput();

    expect(result.lastFrame()).toContain("hello tui");

    result.stdin.write("\u001B");
    await flushInput();

    expect(result.lastFrame()).not.toContain("hello tui");
    result.unmount();
    store.dispose();
  });

  it("accepts multibyte CJK input in the composer draft", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
      }),
    );

    result.stdin.write("统一 tui");
    await flushInput();

    expect(result.lastFrame()).toContain("统一 tui");
    result.unmount();
    store.dispose();
  });

  it("suggests commands as soon as the user types a slash", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
      }),
    );

    result.stdin.write("/");
    await flushInput();

    const frame = result.lastFrame() ?? "";
    // 建议列表就是发现机制：输一个 / 就能看到能做什么
    expect(frame).toContain("/help");
    expect(frame).toContain("列出全部命令与快捷键");
    expect(frame).toContain("more");
    result.unmount();
    store.dispose();
  });

  it("narrows suggestions while typing and accepts one with tab", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
      }),
    );

    result.stdin.write("/mo");
    await flushInput();
    expect(result.lastFrame()).toContain("/mode");

    result.stdin.write("\t");
    await flushInput();
    expect(result.lastFrame()).toContain("/mode");
    // 采纳后进入参数区，建议列表让位给参数输入
    expect(result.lastFrame()).not.toContain("<normal|auto|plan|edit>");
    result.unmount();
    store.dispose();
  });

  it("opens the help panel locally without touching the command bridge", async () => {
    const store = createShellStore();
    const onExecuteCommand = vi.fn(async () => ({ handled: true }));
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
        onExecuteCommand,
      }),
    );

    result.stdin.write("/help");
    result.stdin.write("\r");
    await flushInput();

    const frame = result.lastFrame() ?? "";
    expect(onExecuteCommand).not.toHaveBeenCalled();
    expect(frame).toContain("快捷键");
    expect(frame).toContain("先出计划，确认后执行");

    result.stdin.write("\u001B");
    await flushInput();
    expect(result.lastFrame()).not.toContain("先出计划，确认后执行");
    result.unmount();
    store.dispose();
  });

  it("opens the status panel locally", async () => {
    const store = createShellStore();
    const onExecuteCommand = vi.fn(async () => ({ handled: true }));
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
        onExecuteCommand,
      }),
    );

    result.stdin.write("/status");
    result.stdin.write("\r");
    await flushInput();

    expect(onExecuteCommand).not.toHaveBeenCalled();
    expect(result.lastFrame() ?? "").toContain("无待处理事项");
    result.unmount();
    store.dispose();
  });

  it("navigates argument-free scene commands locally", async () => {
    const store = createShellStore();
    const onExecuteCommand = vi.fn(async () => ({ handled: true }));
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
        onExecuteCommand,
      }),
    );

    result.stdin.write("/tasks");
    result.stdin.write("\r");
    await flushInput();

    // 无参数的场景命令不必绕 controller 一趟
    expect(onExecuteCommand).not.toHaveBeenCalled();
    expect(result.lastFrame()).toContain("Chat › Tasks");
    result.unmount();
    store.dispose();
  });

  it("returns to chat with escape from a nested scene", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
      }),
    );

    store.navigate("review");
    await flushInput();
    expect(result.lastFrame()).toContain("Chat › Review");

    result.stdin.write("\u001B");
    await flushInput();
    expect(result.lastFrame()).not.toContain("Chat ›");
    result.unmount();
    store.dispose();
  });

  it("routes scenes from the composer with /goto and tab completion", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
      }),
    );

    result.stdin.write("/goto app");
    result.stdin.write("\t");
    await flushInput();

    expect(result.lastFrame()).toContain("/goto approvals");

    result.stdin.write("\r");
    await flushInput();

    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("Chat › Approvals");
    expect(frame).toContain("Pending: 0 | Resolved: 0");
    expect(frame).toContain("No approvals yet");
    expect(frame).not.toContain("/goto approvals");
    result.unmount();
    store.dispose();
  });

  it("reports an unknown scene instead of navigating", async () => {
    const store = createShellStore();
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
      }),
    );

    result.stdin.write("/goto nowhere");
    result.stdin.write("\r");
    await flushInput();

    expect(result.lastFrame()).toContain("未知场景");
    result.unmount();
    store.dispose();
  });

  it("submits composer tasks, switches to chat, and clears the draft", async () => {
    const store = createShellStore();
    const onSubmitTask = vi.fn(async () => undefined);
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
        onSubmitTask,
      }),
    );

    store.navigate("tasks");
    await flushInput();

    result.stdin.write("build unified tui");
    result.stdin.write("\r");
    await flushInput();

    expect(onSubmitTask).toHaveBeenCalledWith("build unified tui");
    // 提交任务把用户带回对话，结果就在眼前
    expect(result.lastFrame()).not.toContain("Chat ›");
    expect(result.lastFrame()).not.toContain("build unified tui");
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
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
        onExecuteCommand,
      }),
    );

    result.stdin.write("/mode plan");
    result.stdin.write("\r");
    await flushInput();
    await flushInput();

    expect(onExecuteCommand).toHaveBeenCalledWith("/mode plan");
    expect(result.lastFrame()).not.toContain("Chat ›");
    expect(result.lastFrame()).toContain("mode: plan");
    result.unmount();
    store.dispose();
  });

  it("restores the draft if a slash command fails", async () => {
    const store = createShellStore();
    const onExecuteCommand = vi.fn(async () => {
      throw new Error("Approval not found: missing");
    });
    const result = render(
      React.createElement(TUIApp, {
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
        onExecuteCommand,
      }),
    );

    result.stdin.write("/approve missing");
    result.stdin.write("\r");
    await flushInput();
    await flushInput();

    expect(onExecuteCommand).toHaveBeenCalledWith("/approve missing");
    expect(result.lastFrame()).toContain("/approve missing");
    expect(result.lastFrame()).toContain("Approval not found: missing");
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
        capabilities: FULL_CAPABILITIES,
        shellStore: store,
        onSubmitTask,
      }),
    );

    result.stdin.write("retry task");
    result.stdin.write("\r");
    await flushInput();
    await flushInput();

    expect(onSubmitTask).toHaveBeenCalledWith("retry task");
    expect(result.lastFrame()).toContain("retry task");
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
        capabilities: FULL_CAPABILITIES,
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

    expect(result.lastFrame()).toContain("next task");
    expect(result.lastFrame()).toContain("controller busy");
    result.unmount();
    store.dispose();
  });
});
