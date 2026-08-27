import { describe, expect, it, vi } from "vitest";
import {
  READ_ONLY_TOOL_PATTERNS,
  SPAWN_AGENT_TOOL_NAME,
  createSpawnAgentTool,
} from "../../../src/agents/spawn.js";
import type { RunContext } from "../../../src/modes/handler.js";
import { createTaskTiming } from "../../../src/session/execution.js";
import { UsageTracker } from "../../../src/session/usage.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import type { AgentDefinition } from "../../../src/types/agent.js";
import type { LLMResponse } from "../../../src/types/provider.js";
import type { ToolDefinition } from "../../../src/types/tool.js";

function explorer(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: "code-explorer",
    description: "定位实现",
    systemPrompt: "你是探索专家",
    maxIterations: 5,
    source: "project",
    ...overrides,
  };
}

function tool(name: string, result: unknown = "ok"): ToolDefinition {
  return {
    name,
    description: `Tool ${name}`,
    parameters: { type: "object", properties: {} },
    execute: vi.fn(async () => ({ success: true, data: result })),
  };
}

function createParentContext(responses: LLMResponse[], tools: ToolDefinition[] = []) {
  const chat = vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error("No mock response left");
    return response;
  });
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerMany(tools);

  const context: RunContext = {
    provider: { name: "mock", chat },
    toolRegistry,
    messages: [{ role: "user", content: "父级历史" }],
    config: { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } },
    usageTracker: new UsageTracker(),
    timing: createTaskTiming(),
    skipConfirm: false,
    confirmToolCall: vi.fn(async () => true),
    output: { onWarning: vi.fn() },
  };

  return { context, chat };
}

describe("createSpawnAgentTool", () => {
  it("runs the sub agent in an isolated context and returns only its conclusion", async () => {
    const { context, chat } = createParentContext([
      { content: "结论：在 registry.ts:13", model: "test" },
    ]);
    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });

    const result = await spawn.execute({ agent_type: "code-explorer", task: "查找注册点" });

    expect(result).toMatchObject({
      success: true,
      data: { agent: "code-explorer", result: "结论：在 registry.ts:13", iterations: 1 },
    });

    // 子 agent 拿到全新的 messages，看不到父级历史
    const childCall = chat.mock.calls[0][0];
    expect(childCall.messages).toEqual([{ role: "user", content: "查找注册点" }]);
    expect(childCall.systemPrompt).toBe("你是探索专家");

    // 父级消息历史未被子 agent 污染
    expect(context.messages).toEqual([{ role: "user", content: "父级历史" }]);
  });

  it("restricts the sub agent to read-only tools by default", async () => {
    const { context, chat } = createParentContext(
      [{ content: "done", model: "test" }],
      [tool("read_file"), tool("write_file"), tool("run_terminal"), tool("grep_search")],
    );
    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });

    await spawn.execute({ agent_type: "code-explorer", task: "查找" });

    const exposed = (chat.mock.calls[0][0].tools ?? []).map((entry: ToolDefinition) => entry.name);
    expect(exposed.sort()).toEqual(["grep_search", "read_file"]);
    expect(READ_ONLY_TOOL_PATTERNS).not.toContain("write_file");
  });

  it("honors an explicit tool whitelist including mcp wildcards", async () => {
    const { context, chat } = createParentContext(
      [{ content: "done", model: "test" }],
      [tool("read_file"), tool("mcp_github_issue"), tool("run_terminal")],
    );
    const spawn = createSpawnAgentTool({
      definitions: [explorer({ tools: ["read_file", "mcp_*"] })],
      parentContext: () => context,
    });

    await spawn.execute({ agent_type: "code-explorer", task: "查找" });

    const exposed = (chat.mock.calls[0][0].tools ?? []).map((entry: ToolDefinition) => entry.name);
    expect(exposed.sort()).toEqual(["mcp_github_issue", "read_file"]);
  });

  it("strips spawn_agent from the child registry to block recursion", async () => {
    const { context, chat } = createParentContext([{ content: "done", model: "test" }]);
    const spawn = createSpawnAgentTool({
      definitions: [explorer({ tools: ["read_file", SPAWN_AGENT_TOOL_NAME] })],
      parentContext: () => context,
    });
    context.toolRegistry.register(tool("read_file"));
    context.toolRegistry.register(spawn);

    await spawn.execute({ agent_type: "code-explorer", task: "查找" });

    const exposed = (chat.mock.calls[0][0].tools ?? []).map((entry: ToolDefinition) => entry.name);
    expect(exposed).toEqual(["read_file"]);
  });

  it("refuses to spawn when already at max depth", async () => {
    const { context } = createParentContext([]);
    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
      depth: 1,
    });

    expect(await spawn.execute({ agent_type: "code-explorer", task: "查找" })).toEqual({
      success: false,
      error: "子 agent 不能再派生子 agent",
    });
  });

  it("merges sub agent token usage into the parent tracker", async () => {
    const { context } = createParentContext([
      {
        content: "done",
        model: "test",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ]);
    context.usageTracker.record({ promptTokens: 1, completionTokens: 1, totalTokens: 2 });

    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });
    await spawn.execute({ agent_type: "code-explorer", task: "查找" });

    expect(context.usageTracker.snapshot()).toEqual({
      promptTokens: 11,
      completionTokens: 6,
      totalTokens: 17,
      calls: 2,
    });
  });

  it("rejects an unknown agent name and lists the available ones", async () => {
    const { context } = createParentContext([]);
    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });

    const result = await spawn.execute({ agent_type: "nope", task: "查找" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("code-explorer");
  });

  it("rejects an empty or oversized task", async () => {
    const { context } = createParentContext([]);
    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });

    expect(await spawn.execute({ agent_type: "code-explorer", task: "   " })).toMatchObject({
      success: false,
      error: "task 不能为空",
    });

    const oversized = await spawn.execute({
      agent_type: "code-explorer",
      task: "x".repeat(8001),
    });
    expect(oversized.success).toBe(false);
    expect(oversized.error).toContain("上限");
  });

  it("reports a failure when the sub agent returns nothing", async () => {
    const { context } = createParentContext([{ content: "", model: "test" }]);
    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });

    const result = await spawn.execute({ agent_type: "code-explorer", task: "查找" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("未返回任何结论");
  });

  it("flags a sub agent that exhausted its iteration budget", async () => {
    const responses = Array.from({ length: 5 }, (_, index) => ({
      content: "",
      model: "test",
      toolCalls: [{ id: `call-${index}`, name: "missing", args: {} }],
    }));
    const { context } = createParentContext(responses);
    const spawn = createSpawnAgentTool({
      definitions: [explorer({ maxIterations: 5 })],
      parentContext: () => context,
    });

    const result = await spawn.execute({ agent_type: "code-explorer", task: "查找" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("未返回任何结论");
  });

  it("propagates abort instead of turning it into a tool failure", async () => {
    const controller = new AbortController();
    const { context } = createParentContext([]);
    context.abortSignal = controller.signal;
    context.provider = {
      name: "mock",
      chat: vi.fn(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }),
    };

    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });

    await expect(spawn.execute({ agent_type: "code-explorer", task: "查找" })).rejects.toThrow(
      "aborted",
    );
  });

  it("returns an abort result when the parent was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { context } = createParentContext([]);
    context.abortSignal = controller.signal;

    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });

    expect(await spawn.execute({ agent_type: "code-explorer", task: "查找" })).toEqual({
      success: false,
      error: "Aborted",
    });
  });

  it("falls back to the parent provider when the configured model alias is missing", async () => {
    const { context } = createParentContext([{ content: "done", model: "test" }]);
    const spawn = createSpawnAgentTool({
      definitions: [explorer({ model: "nonexistent" })],
      parentContext: () => context,
    });

    const result = await spawn.execute({ agent_type: "code-explorer", task: "查找" });

    expect(result.success).toBe(true);
    expect(context.output?.onWarning).toHaveBeenCalledWith(
      expect.stringContaining("未在 models 中配置"),
    );
  });

  it("reports lifecycle callbacks for TUI task rows", async () => {
    const { context } = createParentContext([{ content: "结论", model: "test" }]);
    const onAgentStart = vi.fn();
    const onAgentFinish = vi.fn();
    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
      onAgentStart,
      onAgentFinish,
      createAgentId: () => "agent-1",
    });

    await spawn.execute({ agent_type: "code-explorer", task: "查找注册点" });

    expect(onAgentStart).toHaveBeenCalledWith("agent-1", expect.objectContaining({
      name: "code-explorer",
    }), "查找注册点");
    expect(onAgentFinish).toHaveBeenCalledWith("agent-1", true, expect.stringContaining("结论"));
  });

  it("does not persist sub agent messages", async () => {
    const { context } = createParentContext([{ content: "done", model: "test" }]);
    const onMessagesChanged = vi.fn();
    context.onMessagesChanged = onMessagesChanged;

    const spawn = createSpawnAgentTool({
      definitions: [explorer()],
      parentContext: () => context,
    });
    await spawn.execute({ agent_type: "code-explorer", task: "查找" });

    expect(onMessagesChanged).not.toHaveBeenCalled();
  });

  it("advertises available agents in its description", () => {
    const { context } = createParentContext([]);
    const spawn = createSpawnAgentTool({
      definitions: [explorer(), explorer({ name: "reviewer", description: "审查代码" })],
      parentContext: () => context,
    });

    expect(spawn.description).toContain("code-explorer: 定位实现");
    expect(spawn.description).toContain("reviewer: 审查代码");
    expect(spawn.description).toContain("自包含");
    expect(spawn.parameters).toMatchObject({
      properties: {
        agent_type: { enum: ["code-explorer", "reviewer"] },
      },
    });
  });
});
