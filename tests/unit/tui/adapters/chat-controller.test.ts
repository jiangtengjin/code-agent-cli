import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "../../../../src/llm/provider.js";
import { InteractionEventEmitter } from "../../../../src/interaction/emitter.js";
import { ToolRegistry } from "../../../../src/tools/registry.js";
import { SessionStore } from "../../../../src/session/store.js";
import { createSessionState } from "../../../../src/session/runtime.js";
import { writeConfigFile } from "../../../../src/config/manager.js";
import { createTUIChatController } from "../../../../src/tui/adapters/chat-controller.js";
import { createShellStore } from "../../../../src/tui/shell/store.js";
import type { Config } from "../../../../src/types/config.js";
import type { ReviewFinding } from "../../../../src/interaction/events.js";

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const config: Config = {
  model: {
    provider: "deepseek",
    model: "deepseek-chat",
    apiKey: "sk-test",
  },
};

describe("createTUIChatController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a task and streams session, message, and task state into the shell store", async () => {
    const emitter = new InteractionEventEmitter();
    const store = createShellStore({ emitter });
    const provider: LLMProvider = {
      name: "test-provider",
      chat: vi.fn(async () => ({
        content: "Task completed from TUI",
        model: "deepseek-chat",
        usage: {
          promptTokens: 12,
          completionTokens: 8,
          totalTokens: 20,
        },
      })),
    };

    const controller = createTUIChatController(config, {
      eventEmitter: emitter,
      provider,
      toolRegistry: new ToolRegistry(),
      resolveWorkspace: async () => ({
        key: "workspace-a",
        path: "D:/JAVA/code-agent-cli",
      }),
      createTaskId: () => "task-1",
      createSessionId: () => "session-1",
      now: () => "2026-07-26T12:00:00.000Z",
    });

    await controller.submitTask("Build unified TUI");

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(store.getState().currentSession).toMatchObject({
      id: "session-1",
      title: "Build unified TUI",
      workspacePath: "D:/JAVA/code-agent-cli",
      status: "idle",
      turnCount: 1,
      latestUserPreview: "Build unified TUI",
      latestAssistantPreview: "Task completed from TUI",
    });
    expect(store.getState().chat.messages.map((message) => message.text)).toEqual([
      "Build unified TUI",
      "Task completed from TUI",
    ]);
    expect(store.getState().tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        title: "Build unified TUI",
        status: "completed",
        mode: "normal",
      }),
    ]);
    store.dispose();
  });

  it("rejects concurrent submissions and preserves the running task state", async () => {
    const emitter = new InteractionEventEmitter();
    const store = createShellStore({ emitter });
    let releaseTask = () => undefined;
    const provider: LLMProvider = {
      name: "test-provider",
      chat: vi.fn(
        () =>
          new Promise((resolve) => {
            releaseTask = () => {
              resolve({
                content: "Finished first task",
                model: "deepseek-chat",
              });
            };
          }),
      ),
    };

    const controller = createTUIChatController(config, {
      eventEmitter: emitter,
      provider,
      toolRegistry: new ToolRegistry(),
      resolveWorkspace: async () => ({
        key: "workspace-a",
        path: "D:/JAVA/code-agent-cli",
      }),
      createTaskId: () => "task-1",
      createSessionId: () => "session-1",
      now: () => "2026-07-26T12:00:00.000Z",
    });

    const firstSubmission = controller.submitTask("First task");
    await flushAsyncWork();

    expect(store.getState().tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        title: "First task",
        status: "running",
      }),
    ]);

    await expect(controller.submitTask("Second task")).rejects.toThrow(
      "A task is already running in the TUI shell.",
    );

    releaseTask();
    await firstSubmission;

    expect(store.getState().tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        title: "First task",
        status: "completed",
      }),
    ]);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it("waits for approval commands before continuing a risky tool call", async () => {
    const emitter = new InteractionEventEmitter();
    const store = createShellStore({ emitter });
    const provider: LLMProvider = {
      name: "test-provider",
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: "Need approval",
          model: "deepseek-chat",
          toolCalls: [
            {
              id: "tool-call-1",
              name: "write_file",
              args: {
                path: "src/tui/app.tsx",
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: "Approved and finished",
          model: "deepseek-chat",
        }),
    };
    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "write_file",
      description: "Writes a file",
      parameters: {},
      requiresConfirm: true,
      execute: vi.fn(async () => ({
        success: true,
      })),
    });

    const controller = createTUIChatController(config, {
      eventEmitter: emitter,
      provider,
      toolRegistry,
      resolveWorkspace: async () => ({
        key: "workspace-a",
        path: "D:/JAVA/code-agent-cli",
      }),
      createTaskId: () => "task-approval",
      createSessionId: () => "session-approval",
      now: () => "2026-07-26T12:10:00.000Z",
    });

    const submission = controller.submitTask("Write the app file");
    await flushAsyncWork();

    expect(store.getState().approvals.items).toEqual([
      expect.objectContaining({
        id: "tool-call-1",
        status: "pending",
        title: "Confirm write_file",
      }),
    ]);
    expect(store.getState().tasks).toEqual([
      expect.objectContaining({
        id: "task-approval",
        status: "awaiting_approval",
      }),
    ]);

    await expect(controller.executeCommand("/approve tool-call-1")).resolves.toMatchObject({
      handled: true,
      note: "approved: tool-call-1",
    });
    await submission;

    expect(store.getState().approvals.items).toEqual([
      expect.objectContaining({
        id: "tool-call-1",
        status: "approved_once",
      }),
    ]);
    expect(store.getState().tasks).toEqual([
      expect.objectContaining({
        id: "task-approval",
        status: "completed",
      }),
    ]);
    expect(store.getState().chat.messages.at(-1)?.text).toBe("Approved and finished");
    store.dispose();
  });

  it("loads the resume scene catalog and restores a matching session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "code-agent-tui-resume-"));
    try {
      const sessionStore = new SessionStore(tempDir);
      const sessionState = createSessionState({
        sessionId: "resume-session-1",
        kind: "interactive",
        mode: "plan",
        workspaceKey: "workspace-a",
        workspacePath: "D:/JAVA/code-agent-cli",
        now: "2026-07-25T10:00:00.000Z",
      });
      sessionState.messages = [
        {
          role: "user",
          content: "Fix auth timeout",
        },
        {
          role: "assistant",
          content: "Investigating auth timeout",
        },
      ];
      sessionState.title = "";
      await sessionStore.saveSession(sessionState);

      const emitter = new InteractionEventEmitter();
      const store = createShellStore({ emitter });
      const controller = createTUIChatController(config, {
        eventEmitter: emitter,
        resolveWorkspace: async () => ({
          key: "workspace-a",
          path: "D:/JAVA/code-agent-cli",
        }),
        sessionsStorePath: tempDir,
        now: () => "2026-07-26T12:20:00.000Z",
      });

      await controller.initialize({
        initialScene: "resume",
      });

      expect(store.getState().resumeCatalog?.items).toHaveLength(1);
      expect(store.getState().resumeCatalog?.items[0]).toMatchObject({
        id: "resume-session-1",
        title: "Fix auth timeout",
      });

      await expect(controller.executeCommand("/resume fix auth")).resolves.toMatchObject({
        handled: true,
        navigateTo: "chat",
      });

      expect(store.getState().currentSession).toMatchObject({
        id: "resume-session-1",
        title: "Fix auth timeout",
        mode: "plan",
      });
      expect(store.getState().chat.messages.map((message) => message.text)).toEqual([
        "Fix auth timeout",
        "Investigating auth timeout",
      ]);
      store.dispose();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("edits, validates, and saves config from shell commands", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "code-agent-tui-config-"));
    const configPath = join(tempDir, "config.jsonc");
    writeConfigFile(configPath, config);

    const emitter = new InteractionEventEmitter();
    const store = createShellStore({ emitter });
    const controller = createTUIChatController(config, {
      eventEmitter: emitter,
      configPath,
      now: () => "2026-07-26T12:30:00.000Z",
    });

    await controller.initialize({
      initialScene: "settings",
    });

    expect(store.getState().configSnapshot).toMatchObject({
      filePath: configPath,
      dirty: false,
      config: expect.objectContaining({
        model: expect.objectContaining({
          model: "deepseek-chat",
        }),
      }),
    });

    await expect(controller.executeCommand('/config set model.model "qwen-plus"')).resolves.toMatchObject({
      handled: true,
      note: "config updated: model.model",
    });

    expect(store.getState().configSnapshot).toMatchObject({
      dirty: true,
      diff: expect.stringContaining("+    \"model\": \"qwen-plus\""),
    });

    await expect(controller.executeCommand("/config save")).resolves.toMatchObject({
      handled: true,
      note: "config saved",
    });

    const savedConfig = JSON.parse(await readFile(configPath, "utf8"));
    expect(savedConfig.model.model).toBe("qwen-plus");
    expect(store.getState().configSnapshot?.dirty).toBe(false);
    store.dispose();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("runs a review command and publishes findings into shell state", async () => {
    const emitter = new InteractionEventEmitter();
    const store = createShellStore({ emitter });
    const findings: ReviewFinding[] = [
      {
        id: "finding-1",
        severity: "medium",
        title: "Missing tests",
        summary: "src/tui/app.tsx changed without matching tests",
        filePath: "src/tui/app.tsx",
      },
    ];
    const controller = createTUIChatController(config, {
      eventEmitter: emitter,
      reviewScanner: vi.fn(async () => findings),
      now: () => "2026-07-26T12:40:00.000Z",
    });

    await expect(controller.executeCommand("/review")).resolves.toMatchObject({
      handled: true,
      navigateTo: "review",
      note: "review findings: 1",
    });

    expect(store.getState().reviewFindings).toEqual(findings);
    store.dispose();
  });
});
