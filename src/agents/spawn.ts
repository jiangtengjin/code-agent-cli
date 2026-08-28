/**
 * spawn_agent 工具 — 子 agent 委派
 *
 * 主 agent 通过此工具把一段自包含的子任务交给独立上下文的子 agent 执行，
 * 只收到最终结论。子 agent 内部的几十次工具调用完全不进入父级消息历史，
 * 这是整个多 agent 能力的收益来源。
 *
 * ToolDefinition.execute 只接受 args、没有 context 参数，因此这里必须是工厂
 * 函数：父级依赖通过闭包捕获，而非模块级常量导出。
 */

import { createProviderForModelConfig } from "../llm/provider-factory.js";
import type { LLMProvider } from "../llm/provider.js";
import type { RunContext } from "../modes/handler.js";
import { createTaskTiming, runExecutionLoop } from "../session/execution.js";
import { UsageTracker } from "../session/usage.js";
import { createScopedToolRegistry } from "../tools/scoped-registry.js";
import type { AgentDefinition } from "../types/agent.js";
import type { LLMConfig } from "../types/config.js";
import type { LLMMessage } from "../types/provider.js";
import type { ToolDefinition, ToolResult } from "../types/tool.js";
import { isAbortError } from "../utils/error.js";

export const SPAWN_AGENT_TOOL_NAME = "spawn_agent";

/**
 * 子 agent 的默认工具集：只读。
 *
 * 只读这一个约束同时消掉三类问题——并发写冲突、审批归属（只读工具无需确认）、
 * 失败回滚。并行探索是常见需求，并行改动几乎从不是好主意，所以写操作统一
 * 回到主 agent。
 */
export const READ_ONLY_TOOL_PATTERNS = [
  "read_file",
  "list_dir",
  "glob_search",
  "grep_search",
] as const;

/** 任务描述长度上限，防止父级把整段对话历史塞进来 */
const MAX_TASK_LENGTH = 8000;

/** 回传内容长度上限，超出则截断 */
const MAX_RESULT_LENGTH = 20000;

/** 派生深度上限。1 表示只有主 agent 能派生，子 agent 不能再派。 */
const MAX_SPAWN_DEPTH = 1;

export interface SpawnAgentDeps {
  /** 可被委派的 agent 定义 */
  definitions: AgentDefinition[];
  /** 父级运行上下文，用于继承 provider、工具集、abort 等 */
  parentContext: () => RunContext;
  /** 当前派生深度，主 agent 为 0 */
  depth?: number;
  /** 子 agent 生命周期回调，用于 TUI 折叠展示 */
  onAgentStart?: (agentId: string, definition: AgentDefinition, task: string) => void;
  onAgentProgress?: (agentId: string, detail: string) => void;
  onAgentFinish?: (agentId: string, success: boolean, detail: string) => void;
  /** 子 agent 运行实例 id 生成器，便于测试注入 */
  createAgentId?: (agentName: string) => string;
}

function buildDescription(definitions: AgentDefinition[]): string {
  const catalog = definitions
    .map((definition) => `- ${definition.name}: ${definition.description}`)
    .join("\n");

  return [
    "把一段自包含的子任务委派给独立的子 agent 执行，只返回它的最终结论。",
    "适合需要大量探索才能得出结论的子任务：子 agent 的搜索过程不会占用你的上下文。",
    "",
    "task 必须完全自包含。子 agent 看不到你与用户的对话，不知道当前文件，",
    "也不知道你之前的结论。把它需要的一切写进去：相关路径、已排除的可能性、",
    "你期望的回报格式。描述不足会让子 agent 自信地给出错误答案。",
    "",
    "可用的 agent：",
    catalog,
  ].join("\n");
}

function resolveProvider(
  definition: AgentDefinition,
  parentContext: RunContext,
): { provider: LLMProvider; warning?: string } {
  if (!definition.model) {
    return { provider: parentContext.provider };
  }

  const modelConfig: LLMConfig | undefined =
    typeof definition.model === "string"
      ? parentContext.config.models?.[definition.model]
      : definition.model;

  if (!modelConfig) {
    return {
      provider: parentContext.provider,
      warning: `agent ${definition.name} 指定的模型 ${String(definition.model)} 未在 models 中配置，回退到父级模型`,
    };
  }

  try {
    return { provider: createProviderForModelConfig(modelConfig) };
  } catch (error) {
    return {
      provider: parentContext.provider,
      warning: `agent ${definition.name} 的模型初始化失败，回退到父级模型：${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function truncate(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) {
    return { text: value, truncated: false };
  }

  return { text: `${value.slice(0, limit)}\n…（结论过长已截断）`, truncated: true };
}

/** 单条工具结果在部分进展摘要里的长度上限 */
const PARTIAL_ENTRY_LIMIT = 400;

/** 部分进展摘要里最多包含的工具结果条数，取最后几条（离结论最近） */
const PARTIAL_ENTRY_COUNT = 5;

/**
 * 从子 agent 的消息历史里提取工具调用结果，供未收敛时回传。
 *
 * 只取工具结果而非完整历史：父级需要的是「查到了什么」，而非子 agent 的
 * 推理过程——后者正是隔离要挡掉的东西。
 */
function summarizeChildProgress(messages: LLMMessage[]): string {
  const entries: string[] = [];

  for (const message of messages) {
    if (message.role !== "tool" || typeof message.content !== "string") continue;

    let payload = message.content;
    try {
      const parsed = JSON.parse(message.content) as { success?: boolean; data?: unknown };
      if (parsed.success === false) continue;
      payload = typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data);
    } catch {
      // 非 JSON 时按原文处理
    }

    if (!payload) continue;
    const clipped =
      payload.length > PARTIAL_ENTRY_LIMIT ? `${payload.slice(0, PARTIAL_ENTRY_LIMIT)}…` : payload;
    entries.push(`- ${message.toolName ?? "tool"}: ${clipped}`);
  }

  return entries.slice(-PARTIAL_ENTRY_COUNT).join("\n");
}

/**
 * 构造子 agent 的运行上下文。
 *
 * 关键点是 messages 为全新空数组——既不克隆父级历史，也不使用
 * forkSessionState（其 structuredClone 语义是给 /fork 用的，与隔离目标相反）。
 */
function createChildContext(
  definition: AgentDefinition,
  parentContext: RunContext,
  provider: LLMProvider,
  usageTracker: UsageTracker,
  childToolRegistry: ReturnType<typeof createScopedToolRegistry>,
  onProgress?: (detail: string) => void,
): RunContext {
  return {
    provider,
    toolRegistry: childToolRegistry,
    messages: [],
    config: parentContext.config,
    systemPrompt: definition.systemPrompt,
    usageTracker,
    costTracker: parentContext.costTracker,
    timing: createTaskTiming(),
    abortSignal: parentContext.abortSignal,
    skipConfirm: parentContext.skipConfirm,
    confirmToolCall: parentContext.confirmToolCall,
    // 子 agent 的历史不持久化：它是父级一次工具调用的实现细节
    onMessagesChanged: undefined,
    onStatusChanged: undefined,
    onPlanStateChanged: undefined,
    output: {
      onToolStart: (toolCall) => onProgress?.(toolCall.name),
      onWarning: (message) => parentContext.output?.onWarning?.(message),
    },
  };
}

export function createSpawnAgentTool(deps: SpawnAgentDeps): ToolDefinition {
  const depth = deps.depth ?? 0;
  const createAgentId =
    deps.createAgentId ??
    ((agentName: string) =>
      `${agentName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

  return {
    name: SPAWN_AGENT_TOOL_NAME,
    description: buildDescription(deps.definitions),
    parameters: {
      type: "object",
      properties: {
        agent_type: {
          type: "string",
          enum: deps.definitions.map((definition) => definition.name),
          description: "要委派的 agent 名称",
        },
        task: {
          type: "string",
          description: "自包含的任务描述，子 agent 看不到当前对话",
        },
      },
      required: ["agent_type", "task"],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      if (depth >= MAX_SPAWN_DEPTH) {
        return { success: false, error: "子 agent 不能再派生子 agent" };
      }

      const agentType = typeof args.agent_type === "string" ? args.agent_type : "";
      const task = typeof args.task === "string" ? args.task.trim() : "";

      const definition = deps.definitions.find((entry) => entry.name === agentType);
      if (!definition) {
        const available = deps.definitions.map((entry) => entry.name).join(", ") || "（无）";
        return { success: false, error: `未知的 agent: ${agentType}。可用：${available}` };
      }

      if (!task) {
        return { success: false, error: "task 不能为空" };
      }

      if (task.length > MAX_TASK_LENGTH) {
        return {
          success: false,
          error: `task 超过 ${MAX_TASK_LENGTH} 字符上限。请只写子 agent 需要的背景，而非整段对话历史。`,
        };
      }

      const parentContext = deps.parentContext();
      if (parentContext.abortSignal?.aborted) {
        return { success: false, error: "Aborted" };
      }

      const agentId = createAgentId(definition.name);
      const { provider, warning } = resolveProvider(definition, parentContext);
      if (warning) {
        parentContext.output?.onWarning?.(warning);
      }

      // 剔除 spawn_agent 自身，与 depth 上限构成双重防递归
      const childToolRegistry = createScopedToolRegistry(
        parentContext.toolRegistry,
        definition.tools ?? READ_ONLY_TOOL_PATTERNS,
      );
      childToolRegistry.unregister(SPAWN_AGENT_TOOL_NAME);

      const usageTracker = new UsageTracker();
      const childContext = createChildContext(
        definition,
        parentContext,
        provider,
        usageTracker,
        childToolRegistry,
        (detail) => deps.onAgentProgress?.(agentId, detail),
      );

      deps.onAgentStart?.(agentId, definition, task);

      try {
        const result = await runExecutionLoop(task, childContext, definition.maxIterations);
        parentContext.usageTracker.merge(usageTracker.snapshot());

        const content = result.assistantContent?.trim() ?? "";
        if (!content) {
          // 迭代耗尽而未收敛时，子 agent 的探索发现全在它的消息历史里。直接报
          // 「无结论」会把这些发现连同已花掉的 token 一起丢弃，父 agent 只能从
          // 头再来。改为回传部分进展，让父级自己判断够不够用。
          const partial = summarizeChildProgress(childContext.messages);
          deps.onAgentFinish?.(agentId, false, partial ? "仅有部分进展" : "无结论返回");

          if (!partial) {
            return {
              success: false,
              error: `agent ${definition.name} 未返回任何结论`,
            };
          }

          return {
            success: false,
            error:
              `agent ${definition.name} 在 ${result.iterations} 轮内未收敛，以下是它已经查到的内容，` +
              `可据此判断是补充任务描述重派，还是自行继续：\n${partial}`,
          };
        }

        const { text, truncated } = truncate(content, MAX_RESULT_LENGTH);
        deps.onAgentFinish?.(agentId, true, text.slice(0, 120));

        return {
          success: true,
          data: {
            agent: definition.name,
            result: text,
            iterations: result.iterations,
            ...(result.reachedLimit ? { reachedLimit: true } : {}),
            ...(truncated ? { truncated: true } : {}),
          },
        };
      } catch (error) {
        parentContext.usageTracker.merge(usageTracker.snapshot());
        const message = error instanceof Error ? error.message : String(error);
        deps.onAgentFinish?.(agentId, false, message);

        // 中断必须向上传播，否则父级循环会把它当成普通工具失败继续跑下去
        if (isAbortError(error)) {
          throw error;
        }

        return { success: false, error: `agent ${definition.name} 执行失败：${message}` };
      }
    },
  };
}
