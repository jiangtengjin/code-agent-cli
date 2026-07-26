import { describe, expect, it } from "vitest";
import { createInteractionEvent } from "../../../../src/interaction/events.js";
import { createInteractionEventAction, createSceneChangedAction } from "../../../../src/tui/shell/actions.js";
import { reduceShellState } from "../../../../src/tui/shell/reducer.js";
import {
  createInitialShellState,
  selectTaskBoardSummary,
  selectInspectorSummary,
  selectRailItems,
  selectStatusBarSummary,
} from "../../../../src/tui/shell/state.js";

describe("shell state selectors", () => {
  it("derives the status bar summary from shell state", () => {
    const state = [
      createInteractionEvent(
        "session.changed",
        {
          summary: {
            id: "session-3",
            kind: "interactive",
            title: "Live TUI shell",
            workspaceKey: "workspace-a",
            workspacePath: "D:/JAVA/code-agent-cli",
            status: "running",
            mode: "plan",
            createdAt: "2026-07-26T14:00:00.000Z",
            updatedAt: "2026-07-26T14:04:00.000Z",
            lastActiveAt: "2026-07-26T14:04:00.000Z",
            turnCount: 6,
          },
        },
        "2026-07-26T14:00:30.000Z",
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
            title: "Approve file write",
            summary: "Write the shell layout",
            risk: "high",
          },
        },
        "2026-07-26T14:01:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-1",
            title: "Implement shell frame",
            status: "running",
            mode: "plan",
          },
        },
        "2026-07-26T14:02:00.000Z",
      ),
    ].reduce(
      (currentState, event) => reduceShellState(currentState, createInteractionEventAction(event)),
      reduceShellState(createInitialShellState(), createSceneChangedAction("chat")),
    );

    expect(selectStatusBarSummary(state)).toMatchObject({
      activeScene: "chat",
      mode: "plan",
      sessionStatus: "running",
      workspacePath: "D:/JAVA/code-agent-cli",
      pendingApprovalCount: 1,
      activeTaskCount: 1,
      lastEventAt: "2026-07-26T14:02:00.000Z",
    });
  });

  it("derives rail badges and inspector context from shell state", () => {
    const state = [
      createInteractionEvent(
        "session.changed",
        {
          summary: {
            id: "session-4",
            kind: "interactive",
            title: "Shell inspector context",
            workspaceKey: "workspace-a",
            workspacePath: "D:/JAVA/code-agent-cli",
            status: "running",
            mode: "normal",
            createdAt: "2026-07-26T14:10:00.000Z",
            updatedAt: "2026-07-26T14:15:00.000Z",
            lastActiveAt: "2026-07-26T14:15:00.000Z",
            turnCount: 9,
            latestUserPreview: "Continue the shell work",
            latestAssistantPreview: "Rendering the inspector",
          },
        },
        "2026-07-26T14:10:30.000Z",
      ),
      createInteractionEvent(
        "tool.finished",
        {
          toolCall: {
            id: "tool-2",
            name: "shell_command",
            args: {
              command: "pnpm test",
            },
          },
          result: {
            success: true,
          },
        },
        "2026-07-26T14:11:00.000Z",
      ),
      createInteractionEvent(
        "approval.requested",
        {
          request: {
            id: "approval-2",
            toolCall: {
              id: "tool-3",
              name: "git commit",
              args: {},
            },
            title: "Approve commit",
            summary: "Create the shell layout commit",
            risk: "medium",
          },
        },
        "2026-07-26T14:12:00.000Z",
      ),
      createInteractionEvent(
        "review.findings.ready",
        {
          findings: [
            {
              id: "finding-1",
              severity: "high",
              title: "Missing live composer",
              summary: "Composer section still needs input plumbing",
            },
          ],
        },
        "2026-07-26T14:13:00.000Z",
      ),
      createInteractionEvent(
        "config.snapshot.updated",
        {
          snapshot: {
            filePath: "D:/tmp/config.jsonc",
            config: {
              model: {
                provider: "deepseek",
                model: "deepseek-chat",
              },
            },
            dirty: true,
            diff: "+    \"model\": \"deepseek-chat\"",
            updatedAt: "2026-07-26T14:13:30.000Z",
          },
        },
        "2026-07-26T14:13:30.000Z",
      ),
      createInteractionEvent(
        "config.validation.updated",
        {
          validation: {
            status: "invalid",
            issues: [
              {
                path: "model.provider",
                message: "Unknown provider",
                severity: "error",
              },
            ],
          },
        },
        "2026-07-26T14:14:00.000Z",
      ),
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
            },
          ],
        },
        "2026-07-26T14:15:00.000Z",
      ),
      createInteractionEvent(
        "resume.catalog.updated",
        {
          catalog: {
            items: [
              {
                id: "session-4",
                title: "Shell inspector context",
                mode: "normal",
                status: "running",
                updatedAt: "2026-07-26T14:15:20.000Z",
                workspacePath: "D:/JAVA/code-agent-cli",
              },
            ],
          },
        },
        "2026-07-26T14:15:20.000Z",
      ),
      createInteractionEvent(
        "resume.loaded",
        {
          sessionId: "session-4",
          resumedFromInterrupted: true,
        },
        "2026-07-26T14:15:30.000Z",
      ),
    ].reduce(
      (currentState, event) => reduceShellState(currentState, createInteractionEventAction(event)),
      createInitialShellState(),
    );

    const railItems = selectRailItems(state);
    const inspector = selectInspectorSummary(state);

    expect(railItems.find((item) => item.scene === "home")).toMatchObject({
      isActive: true,
      label: "Home",
    });
    expect(railItems.find((item) => item.scene === "approvals")).toMatchObject({
      badge: "1",
    });
    expect(railItems.find((item) => item.scene === "review")).toMatchObject({
      badge: "1",
    });
    expect(railItems.find((item) => item.scene === "resume")).toMatchObject({
      badge: "1",
    });
    expect(railItems.find((item) => item.scene === "tasks")).toMatchObject({
      badge: undefined,
    });
    expect(inspector).toMatchObject({
      sessionTitle: "Shell inspector context",
      sessionId: "session-4",
      latestUserPreview: "Continue the shell work",
      latestAssistantPreview: "Rendering the inspector",
      latestToolName: "shell_command",
      latestToolStatus: "completed",
      lastResumeSessionId: "session-4",
      reviewFindingCount: 1,
      configStatus: "invalid",
      configIssueCount: 1,
      configDirty: true,
      healthyMcpServerCount: 1,
      totalMcpServerCount: 2,
    });
  });

  it("groups task board content into active, queued, and finished sections", () => {
    const state = [
      createInteractionEvent(
        "session.changed",
        {
          summary: {
            id: "session-5",
            kind: "interactive",
            title: "Task dashboard focus",
            workspaceKey: "workspace-a",
            workspacePath: "D:/JAVA/code-agent-cli",
            status: "running",
            mode: "normal",
            createdAt: "2026-07-26T15:00:00.000Z",
            updatedAt: "2026-07-26T15:05:00.000Z",
            lastActiveAt: "2026-07-26T15:05:00.000Z",
            turnCount: 3,
          },
        },
        "2026-07-26T15:00:10.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-running",
            title: "Run integration tests",
            status: "running",
            mode: "normal",
            detail: "Executing tool calls",
          },
        },
        "2026-07-26T15:01:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-approval",
            title: "Approve git commit",
            status: "awaiting_approval",
            mode: "normal",
            detail: "Waiting for user confirmation",
          },
        },
        "2026-07-26T15:02:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-queued",
            title: "Prepare MCP health report",
            status: "pending",
            mode: "normal",
          },
        },
        "2026-07-26T15:03:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-failed",
            title: "Write release note",
            status: "failed",
            mode: "edit",
            detail: "Patch rejected",
          },
        },
        "2026-07-26T15:04:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-done",
            title: "Build task scene",
            status: "completed",
            mode: "normal",
          },
        },
        "2026-07-26T15:05:00.000Z",
      ),
    ].reduce(
      (currentState, event) => reduceShellState(currentState, createInteractionEventAction(event)),
      createInitialShellState(),
    );

    expect(selectTaskBoardSummary(state)).toMatchObject({
      sessionTitle: "Task dashboard focus",
      activeCount: 2,
      queuedCount: 1,
      finishedCount: 2,
      focusedTaskId: "task-approval",
      counts: {
        pending: 1,
        running: 1,
        awaiting_approval: 1,
        completed: 1,
        failed: 1,
      },
    });
    expect(selectTaskBoardSummary(state).active.map((task) => task.id)).toEqual([
      "task-approval",
      "task-running",
    ]);
    expect(selectTaskBoardSummary(state).queued.map((task) => task.id)).toEqual(["task-queued"]);
    expect(selectTaskBoardSummary(state).finished.map((task) => task.id)).toEqual([
      "task-done",
      "task-failed",
    ]);
  });

  it("counts awaiting approval tasks as active shell work", () => {
    const state = [
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-approval",
            title: "Approve release commit",
            status: "awaiting_approval",
            mode: "normal",
          },
        },
        "2026-07-26T15:10:00.000Z",
      ),
    ].reduce(
      (currentState, event) => reduceShellState(currentState, createInteractionEventAction(event)),
      createInitialShellState(),
    );

    expect(selectStatusBarSummary(state)).toMatchObject({
      activeTaskCount: 1,
    });
    expect(selectRailItems(state).find((item) => item.scene === "tasks")).toMatchObject({
      badge: "1",
    });
  });
});
