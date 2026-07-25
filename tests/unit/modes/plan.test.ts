import { describe, expect, it, vi } from "vitest";
import { PlanModeHandler, executeApprovedPlan } from "../../../src/modes/plan.js";
import { createTaskTiming } from "../../../src/session/execution.js";
import { UsageTracker } from "../../../src/session/usage.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import type { PlanState } from "../../../src/types/plan.js";
import type { LLMMessage, LLMResponse } from "../../../src/types/provider.js";

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
    onPlanState: vi.fn(),
  };

  return {
    provider,
    messages,
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
    output,
  };
}

describe("PlanModeHandler", () => {
  it("creates a structured plan and returns it to the caller", async () => {
    const { context, messages, output, provider } = createContext([
      {
        content: JSON.stringify({
          summary: "为任务生成 2 个可执行步骤",
          steps: [
            { title: "分析代码结构", prompt: "读取并分析项目结构" },
            { title: "实现认证模块", prompt: "创建并修改认证相关文件" },
          ],
        }),
        model: "test",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      },
    ]);

    const result = await new PlanModeHandler().run("给项目添加 JWT 认证", context);

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(messages).toMatchObject([
      { role: "user", content: "给项目添加 JWT 认证" },
      { role: "assistant" },
    ]);
    expect(result.planState).toMatchObject({
      originalTask: "给项目添加 JWT 认证",
      summary: "为任务生成 2 个可执行步骤",
      steps: [
        { title: "分析代码结构", status: "pending" },
        { title: "实现认证模块", status: "pending" },
      ],
    });
    expect(output.onAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining("[PLAN]"),
    );
    expect(output.onTokenUsage).toHaveBeenCalledWith({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it("executes approved plan steps sequentially and marks them as done", async () => {
    const { context, output } = createContext([
      { content: "已分析项目结构", model: "test" },
      { content: "已完成认证模块实现", model: "test" },
    ]);
    const planState: PlanState = {
      originalTask: "给项目添加 JWT 认证",
      summary: "为任务生成 2 个可执行步骤",
      steps: [
        { title: "分析代码结构", prompt: "读取并分析项目结构", status: "pending" },
        { title: "实现认证模块", prompt: "创建并修改认证相关文件", status: "pending" },
      ],
    };

    const result = await executeApprovedPlan(planState, context, 10);

    expect(result.reachedLimit).toBe(false);
    expect(result.assistantContent).toContain("Plan completed");
    expect(planState.steps).toMatchObject([
      { title: "分析代码结构", status: "done" },
      { title: "实现认证模块", status: "done" },
    ]);
    expect(output.onPlanState).toHaveBeenCalled();
    expect(output.onAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining("Plan completed"),
    );
  });
});
