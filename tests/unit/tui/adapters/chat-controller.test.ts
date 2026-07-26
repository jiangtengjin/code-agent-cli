import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "../../../../src/llm/provider.js";
import { InteractionEventEmitter } from "../../../../src/interaction/emitter.js";
import { ToolRegistry } from "../../../../src/tools/registry.js";
import { createTUIChatController } from "../../../../src/tui/adapters/chat-controller.js";
import { createShellStore } from "../../../../src/tui/shell/store.js";
import type { Config } from "../../../../src/types/config.js";

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
});
