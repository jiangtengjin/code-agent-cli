import { describe, expect, it, vi } from "vitest";
import { AutoModeHandler } from "../../../src/modes/auto.js";
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
});
