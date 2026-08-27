import { describe, expect, it, vi } from "vitest";
import { AutoModeHandler } from "../../../src/modes/auto.js";
import { EditModeHandler } from "../../../src/modes/edit.js";
import { NormalModeHandler } from "../../../src/modes/normal.js";
import { createTaskTiming } from "../../../src/session/execution.js";
import { UsageTracker } from "../../../src/session/usage.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import type { LLMMessage, LLMResponse } from "../../../src/types/provider.js";
import type { ToolDefinition } from "../../../src/types/tool.js";

function createContext(responses: LLMResponse[]) {
  const provider = {
    name: "mock-provider",
    chat: vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error("No mock response left");
      return response;
    }),
  };
  const messages: LLMMessage[] = [];
  const toolRegistry = new ToolRegistry();
  const usageTracker = new UsageTracker();
  const output = {
    onAssistantMessage: vi.fn(),
    onTokenUsage: vi.fn(),
    onToolResult: vi.fn(),
    onWarning: vi.fn(),
    onIteration: vi.fn(),
  };

  return {
    provider,
    context: {
      provider,
      toolRegistry,
      messages,
      config: { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } },
      usageTracker,
      timing: createTaskTiming(),
      skipConfirm: false,
      confirmToolCall: vi.fn(async () => true),
      output,
    },
    messages,
    toolRegistry,
    usageTracker,
    output,
  };
}

describe("mode execution loop", () => {
  it("adds user and assistant messages and records usage", async () => {
    const { provider, context, messages, usageTracker, output } = createContext([
      {
        content: "hello",
        model: "test",
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      },
    ]);

    const result = await new NormalModeHandler().run("hi", context);

    expect(result).toMatchObject({ iterations: 1, reachedLimit: false });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      }),
    );
    expect(messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(usageTracker.snapshot()).toMatchObject({ totalTokens: 6, calls: 1 });
    expect(output.onAssistantMessage).toHaveBeenCalledWith("hello");
    expect(output.onTokenUsage).toHaveBeenCalledWith({
      promptTokens: 4,
      completionTokens: 2,
      totalTokens: 6,
    });
  });

  it("passes the active abort signal down to provider calls", async () => {
    const { provider, context } = createContext([
      {
        content: "hello",
        model: "test",
      },
    ]);
    const abortController = new AbortController();
    context.abortSignal = abortController.signal;

    await new NormalModeHandler().run("hi", context);

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: abortController.signal,
      }),
    );
  });

  it("notifies message persistence hooks whenever the transcript changes", async () => {
    const onMessagesChanged = vi.fn();
    const { context } = createContext([
      {
        content: "",
        model: "test",
        toolCalls: [{ id: "call-1", name: "missing_tool", args: {} }],
      },
      { content: "done", model: "test" },
    ]);
    context.onMessagesChanged = onMessagesChanged;

    await new NormalModeHandler().run("use a tool", context);

    expect(onMessagesChanged).toHaveBeenCalledTimes(4);
    expect(onMessagesChanged.mock.calls[0][0]).toEqual([{ role: "user", content: "use a tool" }]);
    expect(onMessagesChanged.mock.calls.at(-1)?.[0]).toMatchObject([
      { role: "user", content: "use a tool" },
      { role: "assistant", content: null },
      { role: "tool", toolCallId: "call-1" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("executes tool calls and sends tool results back through messages", async () => {
    const tool: ToolDefinition = {
      name: "read_context",
      description: "Read context",
      parameters: { type: "object", properties: {} },
      execute: vi.fn(async () => ({ success: true, data: "tool data" })),
    };
    const { provider, context, messages, toolRegistry } = createContext([
      {
        content: "",
        model: "test",
        toolCalls: [{ id: "call-1", name: "read_context", args: { path: "README.md" } }],
      },
      { content: "done", model: "test" },
    ]);
    toolRegistry.register(tool);

    const result = await new NormalModeHandler().run("use a tool", context);

    expect(result).toMatchObject({ iterations: 2, reachedLimit: false });
    expect(tool.execute).toHaveBeenCalledWith({ path: "README.md" });
    expect(messages).toMatchObject([
      { role: "user", content: "use a tool" },
      { role: "assistant", content: null },
      { role: "tool", toolCallId: "call-1" },
      { role: "assistant", content: "done" },
    ]);
    expect(JSON.parse(String(messages[2].content))).toEqual({
      success: true,
      data: "tool data",
    });
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it("preserves assistant content on tool-call messages", async () => {
    const tool: ToolDefinition = {
      name: "read_context",
      description: "Read context",
      parameters: { type: "object", properties: {} },
      execute: vi.fn(async () => ({ success: true, data: "tool data" })),
    };
    const { context, messages, toolRegistry } = createContext([
      {
        content: "I'll inspect that",
        model: "test",
        toolCalls: [{ id: "call-1", name: "read_context", args: { path: "README.md" } }],
      },
      { content: "done", model: "test" },
    ]);
    toolRegistry.register(tool);

    await new NormalModeHandler().run("use a tool", context);

    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "I'll inspect that",
    });
  });

  it("denies confirmed tools without executing and records the cancellation", async () => {
    const tool: ToolDefinition = {
      name: "write_file",
      description: "Write a file",
      parameters: { type: "object", properties: {} },
      requiresConfirm: true,
      execute: vi.fn(async () => ({ success: true })),
    };
    const { context, messages, output, toolRegistry } = createContext([
      {
        content: "",
        model: "test",
        toolCalls: [{ id: "call-1", name: "write_file", args: { path: "README.md" } }],
      },
      { content: "done", model: "test" },
    ]);
    const confirmToolCall = vi.fn(async () => false);
    context.confirmToolCall = confirmToolCall;
    toolRegistry.register(tool);

    const result = await new NormalModeHandler().run("write a file", context);

    expect(result).toMatchObject({ iterations: 2, reachedLimit: false });
    expect(confirmToolCall).toHaveBeenCalledWith({
      id: "call-1",
      name: "write_file",
      args: { path: "README.md" },
    });
    expect(tool.execute).not.toHaveBeenCalled();
    expect(JSON.parse(String(messages[2].content))).toEqual({
      success: false,
      error: "User cancelled",
    });
    expect(output.onToolResult).toHaveBeenCalledWith(
      { id: "call-1", name: "write_file", args: { path: "README.md" } },
      { success: false, error: "User cancelled" },
      0,
    );
  });

  it("bypasses confirmation when skipConfirm is true", async () => {
    const tool: ToolDefinition = {
      name: "write_file",
      description: "Write a file",
      parameters: { type: "object", properties: {} },
      requiresConfirm: true,
      execute: vi.fn(async () => ({ success: true, data: "wrote file" })),
    };
    const { context, messages, toolRegistry } = createContext([
      {
        content: "",
        model: "test",
        toolCalls: [{ id: "call-1", name: "write_file", args: { path: "README.md" } }],
      },
      { content: "done", model: "test" },
    ]);
    const confirmToolCall = vi.fn(async () => false);
    context.confirmToolCall = confirmToolCall;
    context.skipConfirm = true;
    toolRegistry.register(tool);

    await new NormalModeHandler().run("write a file", context);

    expect(confirmToolCall).not.toHaveBeenCalled();
    expect(tool.execute).toHaveBeenCalledWith({ path: "README.md" });
    expect(JSON.parse(String(messages[2].content))).toEqual({
      success: true,
      data: "wrote file",
    });
  });

  it("turns thrown tool errors into tool result messages", async () => {
    const tool: ToolDefinition = {
      name: "read_context",
      description: "Read context",
      parameters: { type: "object", properties: {} },
      execute: vi.fn(async () => {
        throw new Error("disk unavailable");
      }),
    };
    const { context, messages, output, toolRegistry } = createContext([
      {
        content: "",
        model: "test",
        toolCalls: [{ id: "call-1", name: "read_context", args: { path: "README.md" } }],
      },
      { content: "done", model: "test" },
    ]);
    toolRegistry.register(tool);

    await new NormalModeHandler().run("read a file", context);

    expect(JSON.parse(String(messages[2].content))).toEqual({
      success: false,
      error: "disk unavailable",
    });
    expect(output.onToolResult).toHaveBeenCalledWith(
      { id: "call-1", name: "read_context", args: { path: "README.md" } },
      { success: false, error: "disk unavailable" },
      expect.any(Number),
    );
  });

  it("stops normal mode at its iteration cap and reports a warning", async () => {
    const responses = Array.from({ length: 10 }, (_, index) => ({
      content: "",
      model: "test",
      toolCalls: [{ id: `call-${index}`, name: "missing_tool", args: {} }],
    }));
    const { context, output } = createContext(responses);

    const result = await new NormalModeHandler().run("keep going", context);

    expect(result).toMatchObject({ iterations: 10, reachedLimit: true });
    expect(output.onWarning).toHaveBeenCalledWith(
      "Reached max execution steps; the task may be incomplete.",
    );
  });

  it("stops auto mode at its iteration cap and reports a warning", async () => {
    const responses = Array.from({ length: 25 }, (_, index) => ({
      content: "",
      model: "test",
      toolCalls: [{ id: `call-${index}`, name: "missing_tool", args: {} }],
    }));
    const { context, output } = createContext(responses);

    const result = await new AutoModeHandler().run("keep going", context);

    expect(result).toMatchObject({ iterations: 25, reachedLimit: true });
    expect(output.onWarning).toHaveBeenCalledWith(
      "Reached max execution steps; the task may be incomplete.",
    );
  });

  it("limits edit mode to file and search tools", async () => {
    const safeTool: ToolDefinition = {
      name: "edit_file",
      description: "Edit a file",
      parameters: { type: "object", properties: {} },
      execute: vi.fn(async () => ({ success: true, data: "edited" })),
    };
    const unsafeTool: ToolDefinition = {
      name: "run_terminal",
      description: "Run a command",
      parameters: { type: "object", properties: {} },
      execute: vi.fn(async () => ({ success: true, data: "ran" })),
    };
    const { provider, context, messages, toolRegistry } = createContext([
      {
        content: "",
        model: "test",
        toolCalls: [{ id: "call-1", name: "run_terminal", args: { command: "npm test" } }],
      },
      { content: "done", model: "test" },
    ]);
    toolRegistry.register(safeTool);
    toolRegistry.register(unsafeTool);

    await new EditModeHandler().run("change code only", context);

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [expect.objectContaining({ name: "edit_file" })],
      }),
    );
    expect(provider.chat.mock.calls[0][0].tools).not.toContain(
      expect.objectContaining({ name: "run_terminal" }),
    );
    expect(unsafeTool.execute).not.toHaveBeenCalled();
    expect(JSON.parse(String(messages[2].content))).toEqual({
      success: false,
      error: "Unknown tool: run_terminal",
    });
  });

  it("prefers context.systemPrompt over config.systemPrompt", async () => {
    const { provider, context } = createContext([{ content: "ok", model: "test" }]);
    context.config.systemPrompt = "from config";
    context.systemPrompt = "from agent";

    await new NormalModeHandler().run("hi", context);

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "from agent" }),
    );
  });

  it("falls back to config.systemPrompt when context.systemPrompt is absent", async () => {
    const { provider, context } = createContext([{ content: "ok", model: "test" }]);
    context.config.systemPrompt = "from config";

    await new NormalModeHandler().run("hi", context);

    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "from config" }),
    );
  });
});
