/**
 * GLM 兼容性与子 agent 委派的真实链路测试
 *
 * 需要 .env 提供 CODE_AGENT_API_KEY，未提供时整组跳过。
 *
 * 端点说明：GLM code plan 套餐必须用 /api/coding/paas/v4，
 * 而 provider-factory 里硬编码的 /api/paas/v4 会返回 429「余额不足」——
 * 后者是按量计费端点，套餐额度不在其中。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSpawnAgentTool } from "../../src/agents/spawn.js";
import { OpenAICompatibleProvider } from "../../src/llm/adapters/openai-compat.js";
import { fetchAvailableModels } from "../../src/llm/model-discovery.js";
import type { RunContext } from "../../src/modes/handler.js";
import { NormalModeHandler } from "../../src/modes/normal.js";
import { createTaskTiming } from "../../src/session/execution.js";
import { UsageTracker } from "../../src/session/usage.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { AgentDefinition } from "../../src/types/agent.js";
import type { ToolDefinition } from "../../src/types/tool.js";

const API_KEY = process.env.CODE_AGENT_API_KEY;
const MODEL = process.env.CODE_AGENT_MODEL ?? "glm-4.6";
const BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";

// glm-4.6 是推理模型，每轮要花几千 reasoning token，子 agent 多轮探索容易到分钟级
const TIMEOUT = 300_000;

function createProvider() {
  return new OpenAICompatibleProvider({ model: MODEL, baseUrl: BASE_URL, apiKey: API_KEY! });
}

function createContext(toolRegistry = new ToolRegistry()): RunContext {
  return {
    provider: createProvider(),
    toolRegistry,
    messages: [],
    config: { model: { provider: "glm", model: MODEL, apiKey: API_KEY } },
    usageTracker: new UsageTracker(),
    timing: createTaskTiming(),
    skipConfirm: true,
    confirmToolCall: async () => true,
  };
}

describe.runIf(API_KEY)("GLM 模型发现", () => {
  it("拉取到真实可用的模型列表", async () => {
    const result = await fetchAvailableModels({ baseUrl: BASE_URL, apiKey: API_KEY });

    expect(result.failure).toBeUndefined();
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.some((model) => model.id === MODEL)).toBe(true);
    // 硬编码的 glm-4 早已过时，实际列表里是 4.5 起步——这正是要动态获取的理由
    expect(result.models.some((model) => model.id === "glm-4")).toBe(false);
  }, TIMEOUT);

  it("无效 key 被归类为 unauthorized 而非静默失败", async () => {
    const result = await fetchAvailableModels({ baseUrl: BASE_URL, apiKey: "invalid.key" });

    expect(result.failure).toBe("unauthorized");
    expect(result.models).toEqual([]);
  }, TIMEOUT);
});

describe.runIf(API_KEY)("GLM provider 兼容性", () => {
  it("返回文本内容与 token 用量", async () => {
    const response = await createProvider().chat({
      messages: [{ role: "user", content: "只回复 ok 两个字" }],
    });

    expect(response.content).toBeTruthy();
    expect(response.model).toContain("glm");
    expect(response.usage?.promptTokens).toBeGreaterThan(0);
    expect(response.usage?.totalTokens).toBeGreaterThan(0);
  }, TIMEOUT);

  it("按 OpenAI 格式返回工具调用并能正确解析参数", async () => {
    const response = await createProvider().chat({
      messages: [{ role: "user", content: "读取 README.md 的内容" }],
      tools: [
        {
          name: "read_file",
          description: "读取指定路径的文件内容",
          parameters: {
            type: "object",
            properties: { path: { type: "string", description: "文件路径" } },
            required: ["path"],
          },
          execute: async () => ({ success: true }),
        },
      ],
    });

    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls?.[0]?.name).toBe("read_file");
    // args 由 provider 从 JSON 字符串解析而来，验证解析没有出错
    expect(response.toolCalls?.[0]?.args).toMatchObject({ path: "README.md" });
    expect(response.toolCalls?.[0]?.id).toBeTruthy();
  }, TIMEOUT);

  it("保留多轮对话上下文", async () => {
    const response = await createProvider().chat({
      messages: [
        { role: "user", content: "我的名字是张三" },
        { role: "assistant", content: "你好张三！" },
        { role: "user", content: "我叫什么名字？只回答名字" },
      ],
    });

    expect(response.content).toContain("张三");
  }, TIMEOUT);

  it("遵守 systemPrompt", async () => {
    const response = await createProvider().chat({
      messages: [{ role: "user", content: "你是谁？" }],
      systemPrompt: "你必须在回答的开头加上 [AGENT] 前缀。",
    });

    expect(response.content).toContain("[AGENT]");
  }, TIMEOUT);

  it("能走通完整执行循环：工具调用后带着结果继续对话", async () => {
    const toolRegistry = new ToolRegistry();
    const execute = vi.fn(async (args: Record<string, unknown>) => ({
      success: true,
      data: readFileSync(String(args.path), "utf-8").slice(0, 2000),
    }));
    toolRegistry.register({
      name: "read_file",
      description: "读取指定路径的文件内容",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "文件路径" } },
        required: ["path"],
      },
      execute,
    });

    const context = createContext(toolRegistry);
    const result = await new NormalModeHandler().run(
      "读取 src/tools/registry.ts，然后告诉我它导出了什么类",
      context,
    );

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ path: expect.any(String) }));
    expect(result.iterations).toBeGreaterThanOrEqual(2);
    expect(result.assistantContent).toContain("ToolRegistry");
    // 工具结果必须以 role: "tool" 消息回灌，GLM 才能据此作答
    expect(context.messages.some((message) => message.role === "tool")).toBe(true);
  }, TIMEOUT);
});

describe.runIf(API_KEY)("GLM 子 agent 委派全链路", () => {
  const explorer: AgentDefinition = {
    name: "code-explorer",
    description: "在代码库中定位实现、追踪调用链",
    systemPrompt:
      "你是代码库探索专家。你看不到主对话的任何内容。" +
      "用给定的工具查找信息，然后只输出结论，必须包含文件路径。",
    tools: ["read_file", "grep_search"],
    // 压到 4 轮：真实验证里 8 轮会让它探索到 70 秒以上。够收敛，又不至于漫游
    maxIterations: 4,
    source: "project",
  };

  /**
   * 用真实文件系统而非固定返回值。
   *
   * 早先版本无论传什么参数都返回同一份数据，导致 grep 结果与 read 内容互不
   * 印证，模型只能不断换 pattern 重试直到耗尽迭代预算——测的是夹具缺陷而非
   * 兼容性。真实工具的行为必须与参数一致。
   */
  function createSearchTools(): ToolDefinition[] {
    return [
      {
        name: "grep_search",
        description: "在代码库中按正则搜索内容，返回匹配的文件与行号",
        parameters: {
          type: "object",
          properties: { pattern: { type: "string", description: "搜索的正则" } },
          required: ["pattern"],
        },
        execute: async (args) => {
          const pattern = String(args.pattern ?? "");
          try {
            const output = execFileSync(
              "git",
              ["grep", "-n", "-E", pattern, "--", "src/tools/registry.ts"],
              { encoding: "utf-8", timeout: 15_000 },
            );
            return { success: true, data: output.slice(0, 2000) || "（无匹配）" };
          } catch {
            return { success: true, data: "（无匹配）" };
          }
        },
      },
      {
        name: "read_file",
        description: "读取指定路径的文件内容",
        parameters: {
          type: "object",
          properties: { path: { type: "string", description: "文件路径" } },
          required: ["path"],
        },
        execute: async (args) => {
          const path = String(args.path ?? "");
          try {
            return { success: true, data: readFileSync(path, "utf-8").slice(0, 2000) };
          } catch (error) {
            return {
              success: false,
              error: `无法读取 ${path}: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        },
      },
    ];
  }

  it("子 agent 独立跑完并只回传结论，父级上下文不被污染", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerMany(createSearchTools());
    const context = createContext(toolRegistry);
    context.messages.push({ role: "user", content: "父级已有的历史消息" });

    const events: string[] = [];
    const spawn = createSpawnAgentTool({
      definitions: [explorer],
      parentContext: () => context,
      onAgentStart: (_id, definition) => events.push(`start:${definition.name}`),
      onAgentProgress: (_id, detail) => events.push(`progress:${detail}`),
      onAgentFinish: (_id, success) => events.push(`finish:${success}`),
    });

    const result = await spawn.execute({
      agent_type: "code-explorer",
      // 任务描述必须聚焦到单一目标。早先版本写成「查找工具注册的入口函数」，
      // 模型会连带去查 registerMany、类定义、调用点，7 次工具调用花掉 70 秒。
      // 这也正是 task 写法对成本的直接影响。
      task:
        "文件 src/tools/registry.ts 里有一个注册单个工具的方法。" +
        "用 grep_search 搜索 pattern 为 `register\\(tool` 找到它，只回答它在第几行。",
    });

    expect(result.success).toBe(true);
    const data = result.data as { agent: string; result: string; iterations: number };
    expect(data.agent).toBe("code-explorer");
    // 任务只要求回答行号，故断言行号而非文件名——registry.ts:6 是 register(tool) 所在行
    expect(data.result).toMatch(/6/);
    expect(data.iterations).toBeGreaterThanOrEqual(2);

    // 核心断言：子 agent 的工具调用没有进入父级消息历史
    expect(context.messages).toEqual([{ role: "user", content: "父级已有的历史消息" }]);

    // 生命周期回调按顺序触发，且确实调过工具
    expect(events[0]).toBe("start:code-explorer");
    expect(events.some((event) => event.startsWith("progress:"))).toBe(true);
    expect(events.at(-1)).toBe("finish:true");

    // 用量已并回父级
    expect(context.usageTracker.snapshot().totalTokens).toBeGreaterThan(0);
  }, TIMEOUT);

  it("主 agent 委派后，子 agent 的工具调用不进入父级上下文", async () => {
    // 只给主 agent spawn_agent，不给搜索工具。
    //
    // 早先版本把 grep_search / read_file 也给了主 agent，结果它选择自己直接查
    // （父级历史里出现 20 条工具消息）。那是合理行为而非缺陷——任务不够重时
    // 直接干比委派更划算，所以「模型是否愿意委派」不适合做硬断言。这里要验的
    // 是委派发生后隔离是否生效，故收窄主 agent 的工具集使委派成为唯一路径。
    const parentRegistry = new ToolRegistry();
    const childRegistry = new ToolRegistry();
    childRegistry.registerMany(createSearchTools());

    const context = createContext(parentRegistry);
    const spawn = createSpawnAgentTool({
      definitions: [explorer],
      // 子 agent 的工具从 childRegistry 派生，父级自身没有这些工具
      parentContext: () => ({ ...context, toolRegistry: childRegistry }),
    });
    parentRegistry.register(spawn);

    const result = await new NormalModeHandler().run(
      "src/tools/registry.ts 里注册单个工具的方法在第几行？你自己没有搜索工具，请委派子 agent 查。",
      context,
    );

    const spawnResults = context.messages.filter(
      (message) => message.role === "tool" && message.toolName === "spawn_agent",
    );
    expect(spawnResults.length).toBeGreaterThanOrEqual(1);

    // 核心断言：父级历史里只有 spawn_agent 的结果，没有子 agent 内部的 grep/read
    const leakedChildCalls = context.messages.filter(
      (message) =>
        message.role === "tool" &&
        (message.toolName === "grep_search" || message.toolName === "read_file"),
    );
    expect(leakedChildCalls).toHaveLength(0);
    expect(result.assistantContent).toBeTruthy();
  }, TIMEOUT);
});
