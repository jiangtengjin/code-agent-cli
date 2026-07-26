import { describe, expect, it } from "vitest";
import { createInteractionEvent } from "../../../../src/interaction/events.js";
import {
  createInteractionEventAction,
  createSceneChangedAction,
} from "../../../../src/tui/shell/actions.js";
import { reduceShellState } from "../../../../src/tui/shell/reducer.js";
import { createInitialShellState, selectHomeSummary } from "../../../../src/tui/shell/state.js";
import type { ShellState } from "../../../../src/tui/shell/state.js";
import type { InteractionEvent } from "../../../../src/interaction/events.js";

function reduceEvents(events: InteractionEvent[], state?: ShellState): ShellState {
  return events.reduce(
    (currentState, event) => reduceShellState(currentState, createInteractionEventAction(event)),
    state ?? createInitialShellState(),
  );
}

describe("reduceShellState", () => {
  it("tracks scene changes and maps interaction events into shell state", () => {
    const session = {
      id: "session-1",
      kind: "interactive" as const,
      title: "Fix shell state",
      workspaceKey: "workspace-a",
      workspacePath: "D:/JAVA/code-agent-cli",
      status: "running" as const,
      mode: "normal" as const,
      createdAt: "2026-07-26T09:00:00.000Z",
      updatedAt: "2026-07-26T09:03:00.000Z",
      lastActiveAt: "2026-07-26T09:03:00.000Z",
      turnCount: 3,
      latestUserPreview: "Inspect the shell state task",
      latestAssistantPreview: "Implementing reducer",
    };

    const messageEvent = createInteractionEvent(
      "message.added",
      {
        message: {
          role: "user",
          content: "Inspect the shell state task",
        },
      },
      "2026-07-26T09:00:00.000Z",
    );

    const toolStartedEvent = createInteractionEvent(
      "tool.started",
      {
        toolCall: {
          id: "tool-1",
          name: "write_file",
          args: { path: "src/tui/shell/reducer.ts" },
        },
        requiresApproval: true,
      },
      "2026-07-26T09:01:00.000Z",
    );

    const toolFinishedEvent = createInteractionEvent(
      "tool.finished",
      {
        toolCall: {
          id: "tool-1",
          name: "write_file",
          args: { path: "src/tui/shell/reducer.ts" },
        },
        result: {
          success: true,
          metadata: {
            filePath: "src/tui/shell/reducer.ts",
          },
        },
      },
      "2026-07-26T09:02:00.000Z",
    );

    const nextState = reduceEvents(
      [
        createInteractionEvent(
          "session.changed",
          {
            summary: session,
          },
          "2026-07-26T09:00:30.000Z",
        ),
        messageEvent,
        toolStartedEvent,
        createInteractionEvent(
          "approval.requested",
          {
            request: {
              id: "approval-1",
              toolCall: {
                id: "tool-1",
                name: "write_file",
                args: { path: "src/tui/shell/reducer.ts" },
              },
              title: "Approve write",
              summary: "Write reducer implementation",
              risk: "medium",
              workingDirectory: "D:/JAVA/code-agent-cli",
            },
          },
          "2026-07-26T09:01:10.000Z",
        ),
        createInteractionEvent(
          "approval.resolved",
          {
            requestId: "approval-1",
            resolution: "approved_once",
          },
          "2026-07-26T09:01:20.000Z",
        ),
        createInteractionEvent(
          "task.updated",
          {
            task: {
              id: "task-1",
              title: "Implement shell reducer",
              status: "awaiting_approval",
              mode: "normal",
            },
          },
          "2026-07-26T09:01:30.000Z",
        ),
        toolFinishedEvent,
        createInteractionEvent(
          "resume.catalog.updated",
          {
            catalog: {
              items: [
                {
                  id: "session-1",
                  title: "Fix shell state",
                  mode: "normal",
                  status: "running",
                  updatedAt: "2026-07-26T09:02:05.000Z",
                  workspacePath: "D:/JAVA/code-agent-cli",
                },
              ],
            },
          },
          "2026-07-26T09:02:05.000Z",
        ),
        createInteractionEvent(
          "resume.loaded",
          {
            sessionId: "session-1",
            resumedFromInterrupted: true,
          },
          "2026-07-26T09:02:10.000Z",
        ),
        createInteractionEvent(
          "review.findings.ready",
          {
            findings: [
              {
                id: "finding-1",
                severity: "medium",
                title: "Missing replay coverage",
                summary: "Replay path is not covered yet",
                filePath: "src/tui/shell/store.ts",
                line: 42,
              },
            ],
          },
          "2026-07-26T09:02:20.000Z",
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
              updatedAt: "2026-07-26T09:02:25.000Z",
            },
          },
          "2026-07-26T09:02:25.000Z",
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
          "2026-07-26T09:02:30.000Z",
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
            ],
          },
          "2026-07-26T09:03:00.000Z",
        ),
      ],
      reduceShellState(createInitialShellState(), createSceneChangedAction("chat")),
    );

    expect(nextState.activeScene).toBe("chat");
    expect(nextState.currentSession).toMatchObject({
      id: "session-1",
      title: "Fix shell state",
    });
    expect(nextState.chat.messages).toEqual([
      expect.objectContaining({
        role: "user",
        text: "Inspect the shell state task",
      }),
    ]);
    expect(nextState.chat.tools).toEqual([
      expect.objectContaining({
        id: "tool-1",
        name: "write_file",
        status: "completed",
        requiresApproval: true,
      }),
    ]);
    expect(nextState.approvals.items).toEqual([
      expect.objectContaining({
        id: "approval-1",
        status: "approved_once",
      }),
    ]);
    expect(nextState.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        status: "awaiting_approval",
      }),
    ]);
    expect(nextState.resume).toMatchObject({
      sessionId: "session-1",
      resumedFromInterrupted: true,
    });
    expect(nextState.resumeCatalog).toEqual({
      items: [
        expect.objectContaining({
          id: "session-1",
          title: "Fix shell state",
        }),
      ],
    });
    expect(nextState.reviewFindings).toHaveLength(1);
    expect(nextState.configSnapshot).toMatchObject({
      filePath: "D:/tmp/config.jsonc",
      dirty: true,
    });
    expect(nextState.configValidation).toMatchObject({
      status: "invalid",
    });
    expect(nextState.mcpServers).toEqual([
      expect.objectContaining({
        serverName: "filesystem",
        status: "healthy",
      }),
    ]);
    expect(nextState.lastEventAt).toBe("2026-07-26T09:03:00.000Z");
  });

  it("preserves tool history even when a finish event arrives before the start event", () => {
    const nextState = reduceEvents([
      createInteractionEvent(
        "tool.finished",
        {
          toolCall: {
            id: "tool-2",
            name: "shell_command",
            args: { command: "pnpm test" },
          },
          result: {
            success: false,
            error: "Command failed",
          },
        },
        "2026-07-26T09:04:00.000Z",
      ),
    ]);

    expect(nextState.chat.tools).toEqual([
      expect.objectContaining({
        id: "tool-2",
        name: "shell_command",
        status: "failed",
        finishedAt: "2026-07-26T09:04:00.000Z",
      }),
    ]);
  });

  it("clears session-scoped shell data when switching to a different session id", () => {
    const initialState = reduceEvents([
      createInteractionEvent(
        "session.changed",
        {
          summary: {
            id: "session-1",
            kind: "interactive",
            title: "Old session",
            workspaceKey: "workspace-a",
            workspacePath: "D:/JAVA/code-agent-cli",
            status: "running",
            mode: "normal",
            createdAt: "2026-07-26T11:00:00.000Z",
            updatedAt: "2026-07-26T11:01:00.000Z",
            lastActiveAt: "2026-07-26T11:01:00.000Z",
            turnCount: 1,
          },
        },
        "2026-07-26T11:00:00.000Z",
      ),
      createInteractionEvent(
        "message.added",
        {
          message: {
            role: "user",
            content: "Old transcript",
          },
        },
        "2026-07-26T11:00:10.000Z",
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
        "2026-07-26T11:00:20.000Z",
      ),
      createInteractionEvent(
        "approval.requested",
        {
          request: {
            id: "approval-1",
            toolCall: {
              id: "tool-2",
              name: "write_file",
              args: {},
            },
            title: "Approve write",
            summary: "Update the transcript",
            risk: "medium",
          },
        },
        "2026-07-26T11:00:30.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-1",
            title: "Old task",
            status: "running",
            mode: "normal",
          },
        },
        "2026-07-26T11:00:40.000Z",
      ),
    ]);

    const nextState = reduceShellState(
      initialState,
      createInteractionEventAction(
        createInteractionEvent(
          "session.changed",
          {
            summary: {
              id: "session-2",
              kind: "interactive",
              title: "New session",
              workspaceKey: "workspace-a",
              workspacePath: "D:/JAVA/code-agent-cli",
              status: "idle",
              mode: "plan",
              createdAt: "2026-07-26T11:02:00.000Z",
              updatedAt: "2026-07-26T11:02:00.000Z",
              lastActiveAt: "2026-07-26T11:02:00.000Z",
              turnCount: 0,
            },
          },
          "2026-07-26T11:02:00.000Z",
        ),
      ),
    );

    expect(nextState.currentSession).toMatchObject({
      id: "session-2",
      title: "New session",
    });
    expect(nextState.chat.messages).toEqual([]);
    expect(nextState.chat.tools).toEqual([]);
    expect(nextState.approvals.items).toEqual([]);
    expect(nextState.tasks).toEqual([]);
  });
});

describe("selectHomeSummary", () => {
  it("derives the home overview from the shell state", () => {
    const state = reduceEvents([
      createInteractionEvent(
        "session.changed",
        {
          summary: {
            id: "session-2",
            kind: "interactive",
            title: "Build the TUI shell",
            workspaceKey: "workspace-a",
            workspacePath: "D:/JAVA/code-agent-cli",
            status: "running",
            mode: "plan",
            createdAt: "2026-07-26T10:00:00.000Z",
            updatedAt: "2026-07-26T10:10:00.000Z",
            lastActiveAt: "2026-07-26T10:10:00.000Z",
            turnCount: 8,
          },
        },
        "2026-07-26T10:00:30.000Z",
      ),
      createInteractionEvent(
        "message.added",
        {
          message: {
            role: "user",
            content: "Continue the TUI work",
          },
        },
        "2026-07-26T10:01:00.000Z",
      ),
      createInteractionEvent(
        "message.added",
        {
          message: {
            role: "assistant",
            content: "Implementing shell store",
          },
        },
        "2026-07-26T10:01:30.000Z",
      ),
      createInteractionEvent(
        "tool.started",
        {
          toolCall: {
            id: "tool-3",
            name: "shell_command",
            args: { command: "pnpm test" },
          },
          requiresApproval: false,
        },
        "2026-07-26T10:02:00.000Z",
      ),
      createInteractionEvent(
        "approval.requested",
        {
          request: {
            id: "approval-2",
            toolCall: {
              id: "tool-4",
              name: "git commit",
              args: { message: "feat: add shell state layer" },
            },
            title: "Approve commit",
            summary: "Create the shell state layer commit",
            risk: "high",
          },
        },
        "2026-07-26T10:03:00.000Z",
      ),
      createInteractionEvent(
        "approval.requested",
        {
          request: {
            id: "approval-3",
            toolCall: {
              id: "tool-5",
              name: "git show",
              args: { ref: "HEAD" },
            },
            title: "Approve review",
            summary: "Inspect the last commit",
            risk: "medium",
          },
        },
        "2026-07-26T10:03:10.000Z",
      ),
      createInteractionEvent(
        "approval.resolved",
        {
          requestId: "approval-3",
          resolution: "approved",
        },
        "2026-07-26T10:03:20.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-1",
            title: "Write failing tests",
            status: "completed",
            mode: "plan",
          },
        },
        "2026-07-26T10:04:00.000Z",
      ),
      createInteractionEvent(
        "task.updated",
        {
          task: {
            id: "task-2",
            title: "Implement shell store",
            status: "running",
            mode: "normal",
          },
        },
        "2026-07-26T10:05:00.000Z",
      ),
      createInteractionEvent(
        "review.findings.ready",
        {
          findings: [
            {
              id: "finding-1",
              severity: "high",
              title: "Missing dispose path",
              summary: "The store never unsubscribes from the emitter",
            },
            {
              id: "finding-2",
              severity: "medium",
              title: "Home summary does not count approvals",
              summary: "Pending approval count is missing",
            },
          ],
        },
        "2026-07-26T10:06:00.000Z",
      ),
      createInteractionEvent(
        "resume.loaded",
        {
          sessionId: "session-2",
          resumedFromInterrupted: true,
          forkedFromSessionId: "session-0",
        },
        "2026-07-26T10:07:00.000Z",
      ),
    ]);

    const summary = selectHomeSummary(state);

    expect(summary).toMatchObject({
      activeScene: "home",
      sessionTitle: "Build the TUI shell",
      sessionStatus: "running",
      messageCount: 2,
      runningToolCount: 1,
      pendingApprovalCount: 1,
      resolvedApprovalCount: 1,
      reviewFindingCount: 2,
      lastResumeSessionId: "session-2",
    });
    expect(summary.taskCounts).toMatchObject({
      completed: 1,
      running: 1,
    });
  });
});
