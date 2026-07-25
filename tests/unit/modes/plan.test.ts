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

  it("accepts jsonc-style plan output wrapped in prose", async () => {
    const { context, output } = createContext([
      {
        content: [
          "Here is the plan:",
          "```json",
          "{",
          '  "summary": "Analyze the startup flow",',
          '  "steps": [',
          '    { "title": "Inspect package metadata", "prompt": "Read package.json and identify the startup scripts." },',
          '    { "title": "Trace the CLI entry", "prompt": "Read src/index.ts and summarize how the CLI program boots." },',
          "  ],",
          "}",
          "```",
        ].join("\n"),
        model: "test",
      },
    ]);

    const result = await new PlanModeHandler().run(
      "Analyze the startup flow without editing files",
      context,
    );

    expect(result.planState).toMatchObject({
      summary: "Analyze the startup flow",
      steps: [
        {
          title: "Inspect package metadata",
          prompt: "Read package.json and identify the startup scripts.",
          status: "pending",
        },
        {
          title: "Trace the CLI entry",
          prompt: "Read src/index.ts and summarize how the CLI program boots.",
          status: "pending",
        },
      ],
    });
    expect(output.onAssistantMessage).toHaveBeenCalledWith(expect.stringContaining("[PLAN]"));
  });

  it("falls back to numbered natural-language steps when the model does not return JSON", async () => {
    const { context, output } = createContext([
      {
        content: [
          "Plan: analyze the startup chain step by step.",
          "1. Check package.json to confirm the executable entry and scripts.",
          "2. Read src/index.ts to see how the CLI is created and parsed.",
          "3. Trace src/cli/commands.ts and src/cli/chat.ts to explain the interactive startup path.",
        ].join("\n"),
        model: "test",
      },
    ]);

    const result = await new PlanModeHandler().run(
      "Analyze the startup flow without editing files",
      context,
    );

    expect(result.planState).toMatchObject({
      summary: "analyze the startup chain step by step.",
      steps: [
        {
          title: "Check package.json to confirm the executable entry and scripts",
          prompt: "Check package.json to confirm the executable entry and scripts.",
          status: "pending",
        },
        {
          title: "Read src/index.ts to see how the CLI is created and parsed",
          prompt: "Read src/index.ts to see how the CLI is created and parsed.",
          status: "pending",
        },
        {
          title: "Trace src/cli/commands.ts and src/cli/chat.ts to explain the interactive startup path",
          prompt: "Trace src/cli/commands.ts and src/cli/chat.ts to explain the interactive startup path.",
          status: "pending",
        },
      ],
    });
    expect(output.onPlanState).toHaveBeenCalled();
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
