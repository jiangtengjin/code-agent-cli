# Phase 1d Normal/Auto MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1d MVP loop: separated Normal/Auto execution, cumulative usage reporting, and stdio MCP tool discovery through the official SDK.

**Architecture:** Keep the current readline CLI, but move LLM/tool loop policy out of `src/cli/chat.ts` into focused mode and session modules. MCP servers start from config, register discovered tools into the existing `ToolRegistry`, and are cleaned up by both chat and prompt flows.

**Tech Stack:** TypeScript ESM, Vitest, Commander, readline, existing `ToolRegistry`, `@modelcontextprotocol/sdk` v1, Zod 3.x, pnpm lockfile, npm scripts for verification.

---

## File Structure

Create:

- `src/session/usage.ts`: session-level token usage accumulator and formatter.
- `src/session/execution.ts`: shared mode execution loop, timing helpers, and tool-call execution.
- `src/modes/handler.ts`: `ModeHandler`, `RunContext`, and `ModeRunResult` interfaces.
- `src/modes/normal.ts`: Normal mode handler with a 10-call cap.
- `src/modes/auto.ts`: Auto mode handler with a 25-call cap.
- `src/modes/router.ts`: maps `ChatMode` values to handlers and Phase 1d fallbacks.
- `src/tools/mcp/client.ts`: thin wrapper around official SDK client and stdio transport.
- `src/tools/mcp/manager.ts`: starts configured servers, discovers tools, registers tools, and shuts clients down.
- `tests/unit/session/usage.test.ts`: usage tracker tests.
- `tests/unit/modes/router.test.ts`: mode router tests.
- `tests/unit/modes/execution.test.ts`: execution loop tests.
- `tests/unit/tools/mcp/manager.test.ts`: MCP manager tests with mocked SDK-facing clients.

Modify:

- `src/cli/chat.ts`: use `ModeRouter`, `UsageTracker`, `MCPServerManager`, and shared execution helpers.
- `tests/unit/chat.test.ts`: add `/usage`, mode iteration, and MCP integration regression coverage.
- `package.json`: add `@modelcontextprotocol/sdk` and adjust `zod` if needed by SDK peer requirements.
- `pnpm-lock.yaml`: update dependency lockfile through `pnpm add`.
- `docs/方案设计文档.md`: after implementation, mark completed Phase 1d checklist items that are actually delivered.
- `docs/superpowers/plans/2026-07-18-phase-1d-normal-auto-mcp.md`: check off completed implementation steps as work proceeds.

Do not modify:

- `.idea/`
- `login-app/`

They are untracked and unrelated.

---

## Task 1: Usage Tracker

**Files:**

- Create: `src/session/usage.ts`
- Create: `tests/unit/session/usage.test.ts`

- [ ] **Step 1: Write the failing usage tracker tests**

Create `tests/unit/session/usage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { UsageTracker, formatUsageSnapshot } from "../../../src/session/usage.js";

describe("UsageTracker", () => {
  it("starts with an empty snapshot", () => {
    const tracker = new UsageTracker();

    expect(tracker.snapshot()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    });
  });

  it("accumulates usage from multiple model responses", () => {
    const tracker = new UsageTracker();

    tracker.record({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    tracker.record({ promptTokens: 3, completionTokens: 7, totalTokens: 10 });

    expect(tracker.snapshot()).toEqual({
      promptTokens: 13,
      completionTokens: 12,
      totalTokens: 25,
      calls: 2,
    });
  });

  it("ignores missing usage without counting a call", () => {
    const tracker = new UsageTracker();

    tracker.record(undefined);

    expect(tracker.snapshot()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    });
  });

  it("formats a stable slash-command usage summary", () => {
    const tracker = new UsageTracker();
    tracker.record({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });

    expect(formatUsageSnapshot(tracker.snapshot(), "deepseek-coder")).toContain(
      "Model: deepseek-coder",
    );
    expect(formatUsageSnapshot(tracker.snapshot(), "deepseek-coder")).toContain(
      "Total tokens: 15",
    );
    expect(formatUsageSnapshot(tracker.snapshot(), "deepseek-coder")).toContain(
      "LLM calls: 1",
    );
  });
});
```

- [ ] **Step 2: Run the usage tests and verify they fail**

Run:

```powershell
npm test -- tests/unit/session/usage.test.ts
```

Expected: fail with a module resolution error for `src/session/usage.js`.

- [ ] **Step 3: Implement `src/session/usage.ts`**

Create `src/session/usage.ts`:

```ts
import type { LLMUsage } from "../types/provider.js";

export interface UsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export class UsageTracker {
  private readonly totals: UsageSnapshot = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    calls: 0,
  };

  record(usage: LLMUsage | undefined): void {
    if (!usage) return;

    this.totals.promptTokens += usage.promptTokens;
    this.totals.completionTokens += usage.completionTokens;
    this.totals.totalTokens += usage.totalTokens;
    this.totals.calls += 1;
  }

  snapshot(): UsageSnapshot {
    return { ...this.totals };
  }
}

export function formatUsageSnapshot(snapshot: UsageSnapshot, modelName: string): string {
  return [
    "Token usage",
    `Model: ${modelName}`,
    `Prompt tokens: ${snapshot.promptTokens}`,
    `Completion tokens: ${snapshot.completionTokens}`,
    `Total tokens: ${snapshot.totalTokens}`,
    `LLM calls: ${snapshot.calls}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run the usage tests and verify they pass**

Run:

```powershell
npm test -- tests/unit/session/usage.test.ts
```

Expected: all tests in `usage.test.ts` pass.

- [ ] **Step 5: Commit usage tracker**

Run:

```powershell
git add src/session/usage.ts tests/unit/session/usage.test.ts
git commit -m "feat: add session usage tracker"
```

Expected: commit succeeds with only the usage tracker files.

---

## Task 2: Mode Router and Shared Execution Loop

**Files:**

- Create: `src/modes/handler.ts`
- Create: `src/modes/normal.ts`
- Create: `src/modes/auto.ts`
- Create: `src/modes/router.ts`
- Create: `src/session/execution.ts`
- Create: `tests/unit/modes/router.test.ts`
- Create: `tests/unit/modes/execution.test.ts`

- [ ] **Step 1: Write failing router tests**

Create `tests/unit/modes/router.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ModeRouter } from "../../../src/modes/router.js";

describe("ModeRouter", () => {
  it("returns normal and auto handlers with different caps", () => {
    const router = new ModeRouter();

    expect(router.getHandler("normal")).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
    expect(router.getHandler("auto")).toMatchObject({
      mode: "auto",
      maxIterations: 25,
    });
  });

  it("routes plan and edit through normal behavior in Phase 1d", () => {
    const router = new ModeRouter();

    expect(router.getHandler("plan")).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
    expect(router.getHandler("edit")).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
  });

  it("falls back to normal for invalid mode strings", () => {
    const router = new ModeRouter();

    expect(router.getHandler("invalid")).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
  });
});
```

- [ ] **Step 2: Write failing execution loop tests**

Create `tests/unit/modes/execution.test.ts`:

```ts
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
```

- [ ] **Step 3: Run mode tests and verify they fail**

Run:

```powershell
npm test -- tests/unit/modes/router.test.ts tests/unit/modes/execution.test.ts
```

Expected: fail with module resolution errors for the new `src/modes/*` and `src/session/execution.js` files.

- [ ] **Step 4: Implement mode handler interfaces**

Create `src/modes/handler.ts`:

```ts
import type { LLMProvider } from "../llm/provider.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Config } from "../types/config.js";
import type { ChatMode } from "../types/mode.js";
import type { LLMMessage, LLMToolCall, LLMUsage } from "../types/provider.js";
import type { ToolResult } from "../types/tool.js";
import type { TaskTimingStats } from "../session/execution.js";
import type { UsageTracker } from "../session/usage.js";

export type ConfirmToolCall = (toolCall: LLMToolCall) => Promise<boolean>;

export interface RunOutput {
  onAssistantMessage?: (content: string) => void;
  onTokenUsage?: (usage: LLMUsage) => void;
  onToolStart?: (toolCall: LLMToolCall) => void;
  onToolResult?: (toolCall: LLMToolCall, result: ToolResult, elapsedMs: number) => void;
  onWarning?: (message: string) => void;
  onIteration?: (iteration: number) => void;
}

export interface RunContext {
  provider: LLMProvider;
  toolRegistry: ToolRegistry;
  messages: LLMMessage[];
  config: Config;
  usageTracker: UsageTracker;
  timing: TaskTimingStats;
  skipConfirm: boolean;
  confirmToolCall: ConfirmToolCall;
  output?: RunOutput;
}

export interface ModeRunResult {
  iterations: number;
  reachedLimit: boolean;
  assistantContent?: string;
}

export interface ModeHandler {
  readonly mode: ChatMode;
  readonly maxIterations: number;
  run(input: string, context: RunContext): Promise<ModeRunResult>;
}
```

- [ ] **Step 5: Implement shared execution loop**

Create `src/session/execution.ts`:

```ts
import type { RunContext, ModeRunResult } from "../modes/handler.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { LLMMessage, LLMToolCall } from "../types/provider.js";
import type { ToolResult } from "../types/tool.js";
import { formatDuration } from "../utils/format.js";

export type TaskTimingStats = {
  startedAt: number;
  thinkingMs: number;
  toolMs: number;
  toolCalls: number;
  iterations: number;
};

function nowMs(): number {
  return Date.now();
}

function elapsedSince(startedAt: number): number {
  return Math.max(nowMs() - startedAt, 0);
}

export function createTaskTiming(): TaskTimingStats {
  return {
    startedAt: nowMs(),
    thinkingMs: 0,
    toolMs: 0,
    toolCalls: 0,
    iterations: 0,
  };
}

export function formatTaskTiming(stats: TaskTimingStats, finishedAt = nowMs()): string {
  const totalMs = Math.max(finishedAt - stats.startedAt, 0);
  const parts = [`total ${formatDuration(totalMs)}`, `thinking ${formatDuration(stats.thinkingMs)}`];

  if (stats.toolCalls > 0) {
    parts.push(`tools ${stats.toolCalls} calls ${formatDuration(stats.toolMs)}`);
  }

  if (stats.iterations > 1) {
    parts.push(`iterations ${stats.iterations}`);
  }

  return `Elapsed: ${parts.join(" | ")}`;
}

function assistantToolCallMessage(toolCalls: LLMToolCall[]): LLMMessage {
  return {
    role: "assistant",
    content: null,
    toolCalls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.args),
      },
    })),
  };
}

async function executeOneToolCall(
  toolCall: LLMToolCall,
  toolRegistry: ToolRegistry,
  context: RunContext,
): Promise<ToolResult> {
  context.timing.toolCalls++;
  const tool = toolRegistry.get(toolCall.name);

  if (!tool) {
    const result = { success: false, error: `Unknown tool: ${toolCall.name}` };
    context.output?.onToolResult?.(toolCall, result, 0);
    return result;
  }

  context.output?.onToolStart?.(toolCall);

  if (tool.requiresConfirm && !context.skipConfirm) {
    const confirmed = await context.confirmToolCall(toolCall);
    if (!confirmed) {
      const result = { success: false, error: "User cancelled" };
      context.output?.onToolResult?.(toolCall, result, 0);
      return result;
    }
  }

  const toolStartedAt = nowMs();
  let elapsedMs = 0;
  try {
    const result = await tool.execute(toolCall.args);
    elapsedMs = elapsedSince(toolStartedAt);
    context.output?.onToolResult?.(toolCall, result, elapsedMs);
    return result;
  } catch (error) {
    elapsedMs = elapsedSince(toolStartedAt);
    const message = error instanceof Error ? error.message : String(error);
    const result = { success: false, error: message };
    context.output?.onToolResult?.(toolCall, result, elapsedMs);
    return result;
  } finally {
    context.timing.toolMs += elapsedMs;
  }
}

export async function executeToolCalls(
  toolCalls: LLMToolCall[],
  context: RunContext,
): Promise<void> {
  for (const toolCall of toolCalls) {
    const result = await executeOneToolCall(toolCall, context.toolRegistry, context);
    context.messages.push({
      role: "tool",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: JSON.stringify(result),
    });
  }
}

export async function runExecutionLoop(
  input: string,
  context: RunContext,
  maxIterations: number,
): Promise<ModeRunResult> {
  context.messages.push({ role: "user", content: input });

  let assistantContent: string | undefined;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    context.timing.iterations = iteration;
    context.output?.onIteration?.(iteration);

    const thinkingStartedAt = nowMs();
    const response = await context.provider
      .chat({
        messages: [...context.messages],
        systemPrompt: context.config.systemPrompt,
        tools: context.toolRegistry.getToolDefinitions(),
      })
      .finally(() => {
        context.timing.thinkingMs += elapsedSince(thinkingStartedAt);
      });

    context.usageTracker.record(response.usage);
    if (response.usage) {
      context.output?.onTokenUsage?.(response.usage);
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      context.messages.push(assistantToolCallMessage(response.toolCalls));
      await executeToolCalls(response.toolCalls, context);
      continue;
    }

    if (response.content) {
      assistantContent = response.content;
      context.messages.push({ role: "assistant", content: response.content });
      context.output?.onAssistantMessage?.(response.content);
    }

    return { iterations: iteration, reachedLimit: false, assistantContent };
  }

  const warning = "Reached max execution steps; the task may be incomplete.";
  context.output?.onWarning?.(warning);
  return { iterations: iteration, reachedLimit: true, assistantContent };
}
```

- [ ] **Step 6: Implement normal and auto handlers**

Create `src/modes/normal.ts`:

```ts
import type { ModeHandler, ModeRunResult, RunContext } from "./handler.js";
import { runExecutionLoop } from "../session/execution.js";

export class NormalModeHandler implements ModeHandler {
  readonly mode = "normal" as const;
  readonly maxIterations = 10;

  run(input: string, context: RunContext): Promise<ModeRunResult> {
    return runExecutionLoop(input, context, this.maxIterations);
  }
}
```

Create `src/modes/auto.ts`:

```ts
import type { ModeHandler, ModeRunResult, RunContext } from "./handler.js";
import { runExecutionLoop } from "../session/execution.js";

export class AutoModeHandler implements ModeHandler {
  readonly mode = "auto" as const;
  readonly maxIterations = 25;

  run(input: string, context: RunContext): Promise<ModeRunResult> {
    return runExecutionLoop(input, context, this.maxIterations);
  }
}
```

- [ ] **Step 7: Implement `ModeRouter`**

Create `src/modes/router.ts`:

```ts
import type { ChatMode } from "../types/mode.js";
import type { ModeHandler } from "./handler.js";
import { AutoModeHandler } from "./auto.js";
import { NormalModeHandler } from "./normal.js";

export class ModeRouter {
  private readonly normal = new NormalModeHandler();
  private readonly auto = new AutoModeHandler();

  getHandler(mode: ChatMode | string | undefined): ModeHandler {
    if (mode === "auto") return this.auto;
    return this.normal;
  }
}
```

- [ ] **Step 8: Run mode tests and verify they pass**

Run:

```powershell
npm test -- tests/unit/modes/router.test.ts tests/unit/modes/execution.test.ts
```

Expected: all tests in `router.test.ts` and `execution.test.ts` pass.

- [ ] **Step 9: Commit mode execution core**

Run:

```powershell
git add src/modes src/session/execution.ts tests/unit/modes
git commit -m "feat: add mode execution router"
```

Expected: commit succeeds with only mode and execution files.

---

## Task 3: CLI Refactor and `/usage`

**Files:**

- Modify: `src/cli/chat.ts`
- Modify: `tests/unit/chat.test.ts`

- [ ] **Step 1: Write failing chat tests for `/usage` and mode caps**

Append these tests inside `describe('slash command suggestions', ...)` in `tests/unit/chat.test.ts`:

```ts
  it('suggests the usage command', async () => {
    const { getSlashCommandSuggestions, getSlashCommandCompletion } = await import('../../src/cli/chat.js');

    expect(getSlashCommandSuggestions('/us')[0]).toMatchObject({
      kind: 'command',
      value: 'usage',
    });
    expect(getSlashCommandCompletion('/us')).toEqual({
      start: 1,
      end: 3,
      replacement: 'usage ',
    });
  });
```

Replace the existing `formatTaskTiming` expectation in `describe('task timing', ...)` with:

```ts
    ).toBe('Elapsed: total 3.2s | thinking 1.5s | tools 2 calls 800ms | iterations 3')
```

Append these tests inside `describe('startChat', ...)` in `tests/unit/chat.test.ts`:

```ts
  it('prints cumulative token usage with /usage', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    providerMocks.chat.mockResolvedValueOnce({
      content: 'reply with usage',
      model: 'test',
      usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
    });
    const { startChat } = await import('../../src/cli/chat.js');

    const lineCallbacks: Array<(input: string) => Promise<void> | void> = [];
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb);
    });

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
    } as any);

    await lineCallbacks[0]('hello');
    await lineCallbacks[0]('/usage');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Total tokens: 18'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('LLM calls: 1'));

    logSpy.mockRestore();
  });

  it('uses the auto mode iteration cap when configured', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    providerMocks.chat.mockResolvedValue({
      content: '',
      model: 'test',
      toolCalls: [{ id: 'call-1', name: 'missing_tool', args: {} }],
    });
    const { startChat } = await import('../../src/cli/chat.js');

    const lineCallbacks: Array<(input: string) => Promise<void> | void> = [];
    mockRl.on.mockImplementation((_event: string, cb: (input: string) => Promise<void> | void) => {
      lineCallbacks.push(cb);
    });

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mode: 'auto',
    } as any);

    await lineCallbacks[0]('run autonomously');

    expect(providerMocks.chat).toHaveBeenCalledTimes(25);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Reached max execution steps'),
    );

    logSpy.mockRestore();
  });
```

- [ ] **Step 2: Run chat tests and verify they fail**

Run:

```powershell
npm test -- tests/unit/chat.test.ts
```

Expected: fail because `/usage` is not registered and chat still has a hard-coded `50` loop.

- [ ] **Step 3: Export timing helpers from the shared execution module**

In `src/cli/chat.ts`, remove local `nowMs`, `elapsedSince`, `createTaskTiming`, and `formatTaskTiming`. Add this import near the other imports:

```ts
import {
  createTaskTiming,
  formatTaskTiming,
} from "../session/execution.js";
```

Then add this export below the imports so existing tests can still import `formatTaskTiming` from `src/cli/chat.js`:

```ts
export { formatTaskTiming } from "../session/execution.js";
```

- [ ] **Step 4: Add usage command metadata**

In `src/cli/chat.ts`, add this import:

```ts
import { UsageTracker, formatUsageSnapshot } from "../session/usage.js";
```

Add this entry to the `COMMANDS` array before `exit`:

```ts
  {
    name: "usage",
    desc: "Show token usage",
    aliases: ["tokens"],
    keywords: ["usage", "token", "tokens"],
  },
```

- [ ] **Step 5: Update slash command handling**

Update the `handleSlashCommand` context type in `src/cli/chat.ts`:

```ts
  ctx: {
    messages: LLMMessage[];
    mode: ChatMode;
    config: Config;
    usageTracker: UsageTracker;
    setMode: (m: ChatMode) => void;
  },
```

Add `/usage` to the help output:

```ts
  ${chalk.yellow("/usage")}         Show token usage
```

Add this switch case before `exit`:

```ts
    case "usage":
      console.log(
        chalk.yellow(
          formatUsageSnapshot(
            ctx.usageTracker.snapshot(),
            ctx.config.model?.model ?? "unknown",
          ),
        ),
      );
      break;
```

- [ ] **Step 6: Replace prompt execution loop with `ModeRouter`**

Add this import to `src/cli/chat.ts`:

```ts
import { ModeRouter } from "../modes/router.js";
```

In `runPrompt`, replace the current `messages` initialization and loop with:

```ts
  const toolRegistry = createDefaultToolRegistry();
  const messages: LLMMessage[] = [];
  const timing = createTaskTiming();
  const usageTracker = new UsageTracker();
  const modeRouter = new ModeRouter();
  const handler = modeRouter.getHandler(config.mode);

  try {
    await handler.run(prompt, {
      provider,
      toolRegistry,
      messages,
      config,
      usageTracker,
      timing,
      skipConfirm: Boolean(config.yolo),
      confirmToolCall: async () => false,
      output: {
        onAssistantMessage: (content) => {
          console.log(content);
        },
        onTokenUsage: (usage) => {
          console.log(
            chalk.gray(`Token: input ${usage.promptTokens} / output ${usage.completionTokens}`),
          );
        },
        onToolStart: (toolCall) => {
          console.log(chalk.cyan(`\n---- Tool call: ${toolCall.name} ----`));
          console.log(chalk.gray(`Args: ${JSON.stringify(toolCall.args, null, 2)}`));
        },
        onToolResult: (_toolCall, result, elapsedMs) => {
          if (result.success) {
            console.log(chalk.green(`Tool succeeded (${formatDuration(elapsedMs)})`));
            if (result.metadata?.diff) {
              console.log(chalk.gray("Diff:"));
              console.log(result.metadata.diff);
            }
          } else {
            console.log(chalk.red(`Tool failed (${formatDuration(elapsedMs)}): ${result.error}`));
          }
        },
        onWarning: (message) => {
          console.log(chalk.yellow(`\n${message}`));
        },
      },
    });
  } catch (error) {
    displayError(error);
  }

  console.log(chalk.gray(formatTaskTiming(timing)));
```

- [ ] **Step 7: Replace interactive execution loop with `ModeRouter`**

In `startChat`, add:

```ts
  const usageTracker = new UsageTracker();
  const modeRouter = new ModeRouter();
```

Pass `usageTracker` into `handleSlashCommand`:

```ts
      handleSlashCommand(trimmed, {
        messages,
        mode,
        config,
        usageTracker,
        setMode: (m) => {
          mode = m;
          setChatPrompt();
        },
      });
```

Replace the hard-coded `maxIterations = 50` loop in the readline `line` handler with:

```ts
    const timing = createTaskTiming();
    const spinner = ora({ text: "AI thinking...", color: "cyan" }).start();

    try {
      const handler = modeRouter.getHandler(mode);
      await handler.run(trimmed, {
        provider,
        toolRegistry,
        messages,
        config,
        usageTracker,
        timing,
        skipConfirm: Boolean(config.yolo),
        confirmToolCall: (toolCall) => userConfirm(toolCall, rl),
        output: {
          onIteration: (iteration) => {
            if (iteration > 1) {
              spinner.text = `AI executing... (step ${iteration - 1})`;
              spinner.start();
            }
          },
          onAssistantMessage: (content) => {
            spinner.stop();
            const header = chalk.dim("---- AI ----------------------------------------");
            const footer = chalk.dim("-----------------------------------------------");
            console.log(`\n${header}\n${content}\n${footer}\n`);
          },
          onTokenUsage: (usage) => {
            console.log(chalk.gray(`Token: input ${usage.promptTokens} / output ${usage.completionTokens}`));
          },
          onToolStart: (toolCall) => {
            spinner.stop();
            console.log(chalk.cyan(`\n---- Tool call: ${toolCall.name} ----`));
            console.log(chalk.gray(`Args: ${JSON.stringify(toolCall.args, null, 2)}`));
          },
          onToolResult: (_toolCall, result, elapsedMs) => {
            if (result.success) {
              console.log(chalk.green(`Tool succeeded (${formatDuration(elapsedMs)})`));
              if (result.metadata?.diff) {
                console.log(chalk.gray("Diff:"));
                console.log(result.metadata.diff);
              }
            } else {
              console.log(chalk.red(`Tool failed (${formatDuration(elapsedMs)}): ${result.error}`));
            }
          },
          onWarning: (message) => {
            spinner.stop();
            console.log(chalk.yellow(`\n${message}`));
          },
        },
      });
      spinner.stop();
    } catch (error) {
      spinner.stop();
      displayError(error);
    }
```

Remove the old `messages.push({ role: "user", content: trimmed });` before the loop because the mode handler now adds the user message.

Delete the local helper block from `type ConfirmToolCall = ...` through the closing brace of `handleToolCalls(...)`, immediately before `function userConfirm(...)`. The shared implementation in `src/session/execution.ts` replaces that block.

- [ ] **Step 8: Run chat tests and verify they pass**

Run:

```powershell
npm test -- tests/unit/chat.test.ts tests/unit/modes/router.test.ts tests/unit/modes/execution.test.ts tests/unit/session/usage.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 9: Commit CLI mode refactor**

Run:

```powershell
git add src/cli/chat.ts tests/unit/chat.test.ts
git commit -m "feat: route chat through mode handlers"
```

Expected: commit succeeds with chat refactor files only.

---

## Task 4: Add MCP SDK Dependency

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install the official MCP SDK production line**

Run:

```powershell
pnpm add "@modelcontextprotocol/sdk@^1" "zod@^3.25.0"
```

Expected:

- `package.json` includes `@modelcontextprotocol/sdk`.
- `zod` remains on major version `3`.
- `pnpm-lock.yaml` is updated.

If this command fails with a network or registry error, rerun it with escalated permissions as required by the environment.

- [ ] **Step 2: Verify dependency metadata**

Run:

```powershell
Get-Content -LiteralPath package.json
```

Expected: dependency block contains entries equivalent to:

```json
"@modelcontextprotocol/sdk": "^1.0.0",
"zod": "^3.25.0"
```

The exact SDK patch/minor version can be higher because the install command resolves the current v1 production release.

- [ ] **Step 3: Run typecheck after dependency installation**

Run:

```powershell
npm run typecheck
```

Expected: typecheck passes, because no SDK imports have been added yet.

- [ ] **Step 4: Commit dependency update**

Run:

```powershell
git add package.json pnpm-lock.yaml
git commit -m "chore: add mcp sdk dependency"
```

Expected: commit succeeds with dependency files only.

---

## Task 5: MCP Client and Manager

**Files:**

- Create: `src/tools/mcp/client.ts`
- Create: `src/tools/mcp/manager.ts`
- Create: `tests/unit/tools/mcp/manager.test.ts`

- [ ] **Step 1: Write failing MCP manager tests**

Create `tests/unit/tools/mcp/manager.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCPServerManager, buildMCPRegistryToolName } from "../../../../src/tools/mcp/manager.js";
import { ToolRegistry } from "../../../../src/tools/registry.js";
import type { MCPServerConfig } from "../../../../src/types/config.js";

class FakeMCPClient {
  readonly config: MCPServerConfig;
  connect = vi.fn(async () => undefined);
  listTools = vi.fn(async () => [
    {
      name: "lookup",
      description: "Lookup data",
      inputSchema: { type: "object", properties: { q: { type: "string" } } },
    },
  ]);
  callTool = vi.fn(async () => ({
    content: [{ type: "text", text: "lookup result" }],
    isError: false,
  }));
  close = vi.fn(async () => undefined);

  constructor(config: MCPServerConfig) {
    this.config = config;
  }
}

describe("MCPServerManager", () => {
  let clients: FakeMCPClient[];

  beforeEach(() => {
    clients = [];
  });

  function createManager(config: Record<string, MCPServerConfig>, registry = new ToolRegistry()) {
    return {
      registry,
      manager: new MCPServerManager(config, registry, {
        createClient: (serverConfig) => {
          const client = new FakeMCPClient(serverConfig);
          clients.push(client);
          return client;
        },
      }),
    };
  }

  it("builds stable registry tool names", () => {
    expect(buildMCPRegistryToolName("filesystem", "read_file")).toBe("mcp_filesystem_read_file");
    expect(buildMCPRegistryToolName("my-server", "tool.name")).toBe("mcp_my-server_tool_name");
  });

  it("starts stdio servers and registers discovered tools", async () => {
    const { manager, registry } = createManager({
      filesystem: { command: "node", args: ["server.js"], transport: "stdio" },
    });

    await manager.startAll();

    expect(clients).toHaveLength(1);
    expect(clients[0].connect).toHaveBeenCalledTimes(1);
    expect(clients[0].listTools).toHaveBeenCalledTimes(1);
    const registered = registry.get("mcp_filesystem_lookup");
    expect(registered).toMatchObject({
      name: "mcp_filesystem_lookup",
      requiresConfirm: true,
    });
    expect(registered?.description).toContain("filesystem/lookup");
  });

  it("maps MCP tool results to ToolResult", async () => {
    const { manager, registry } = createManager({
      filesystem: { command: "node", args: ["server.js"] },
    });
    await manager.startAll();

    const result = await registry.get("mcp_filesystem_lookup")?.execute({ q: "abc" });

    expect(clients[0].callTool).toHaveBeenCalledWith("lookup", { q: "abc" });
    expect(result).toEqual({ success: true, data: "lookup result" });
  });

  it("skips unsupported transports and reports warnings", async () => {
    const warnings: string[] = [];
    const registry = new ToolRegistry();
    const manager = new MCPServerManager(
      {
        remote: { command: "node", args: [], transport: "http", url: "https://example.com/mcp" },
      },
      registry,
      {
        createClient: (serverConfig) => new FakeMCPClient(serverConfig),
        onWarning: (message) => warnings.push(message),
      },
    );

    await manager.startAll();

    expect(registry.list()).toEqual([]);
    expect(warnings[0]).toContain("Unsupported MCP transport");
  });

  it("closes every started client", async () => {
    const { manager } = createManager({
      one: { command: "node", args: ["one.js"] },
      two: { command: "node", args: ["two.js"] },
    });
    await manager.startAll();

    await manager.stopAll();

    expect(clients[0].close).toHaveBeenCalledTimes(1);
    expect(clients[1].close).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run MCP manager tests and verify they fail**

Run:

```powershell
npm test -- tests/unit/tools/mcp/manager.test.ts
```

Expected: fail with module resolution errors for `src/tools/mcp/manager.js`.

- [ ] **Step 3: Implement MCP SDK client wrapper**

Create `src/tools/mcp/client.ts`:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "../../types/config.js";
import type { MCPCallToolResult, MCPToolDefinition } from "../../types/mcp.js";

export interface MCPClientLike {
  connect(): Promise<void>;
  listTools(): Promise<MCPToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult>;
  close(): Promise<void>;
}

export class MCPClient implements MCPClientLike {
  private readonly client: Client;
  private readonly transport: StdioClientTransport;

  constructor(config: MCPServerConfig) {
    this.transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
    this.client = new Client({
      name: "code-agent-cli",
      version: "0.1.0",
    });
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult> {
    return (await this.client.callTool({
      name,
      arguments: args,
    })) as MCPCallToolResult;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
```

- [ ] **Step 4: Implement MCP manager and tool registration**

Create `src/tools/mcp/manager.ts`:

```ts
import type { ToolRegistry } from "../registry.js";
import type { MCPServerConfig } from "../../types/config.js";
import type { MCPCallToolResult, MCPToolDefinition } from "../../types/mcp.js";
import type { ToolResult } from "../../types/tool.js";
import { MCPClient, type MCPClientLike } from "./client.js";

export interface MCPServerManagerOptions {
  createClient?: (config: MCPServerConfig) => MCPClientLike;
  onWarning?: (message: string) => void;
}

export interface MCPSummary {
  servers: number;
  tools: number;
}

type StartedServer = {
  name: string;
  client: MCPClientLike;
  tools: number;
};

function normalizeToolNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildMCPRegistryToolName(serverName: string, toolName: string): string {
  return `mcp_${normalizeToolNamePart(serverName)}_${normalizeToolNamePart(toolName)}`;
}

function contentToData(result: MCPCallToolResult): unknown {
  const textParts = result.content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text);

  if (textParts.length === result.content.length && textParts.length > 0) {
    return textParts.join("\n");
  }

  return result.content;
}

function resultToToolResult(
  serverName: string,
  toolName: string,
  result: MCPCallToolResult,
): ToolResult {
  const data = contentToData(result);
  if (result.isError) {
    return {
      success: false,
      error: `MCP tool ${serverName}/${toolName} failed: ${String(data)}`,
    };
  }

  return { success: true, data };
}

export class MCPServerManager {
  private readonly createClient: (config: MCPServerConfig) => MCPClientLike;
  private readonly onWarning: (message: string) => void;
  private readonly startedServers: StartedServer[] = [];

  constructor(
    private readonly config: Record<string, MCPServerConfig> | undefined,
    private readonly registry: ToolRegistry,
    options: MCPServerManagerOptions = {},
  ) {
    this.createClient = options.createClient ?? ((serverConfig) => new MCPClient(serverConfig));
    this.onWarning = options.onWarning ?? (() => undefined);
  }

  async startAll(): Promise<void> {
    for (const [serverName, serverConfig] of Object.entries(this.config ?? {})) {
      if (serverConfig.transport && serverConfig.transport !== "stdio") {
        this.onWarning(`Unsupported MCP transport for ${serverName}: ${serverConfig.transport}`);
        continue;
      }

      try {
        const client = this.createClient(serverConfig);
        await client.connect();
        const tools = await client.listTools();
        this.registerTools(serverName, client, tools);
        this.startedServers.push({ name: serverName, client, tools: tools.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.onWarning(`Failed to start MCP server ${serverName}: ${message}`);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const server of this.startedServers) {
      try {
        await server.client.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.onWarning(`Failed to stop MCP server ${server.name}: ${message}`);
      }
    }
  }

  getSummary(): MCPSummary {
    return {
      servers: this.startedServers.length,
      tools: this.startedServers.reduce((total, server) => total + server.tools, 0),
    };
  }

  private registerTools(
    serverName: string,
    client: MCPClientLike,
    tools: MCPToolDefinition[],
  ): void {
    for (const tool of tools) {
      this.registry.register({
        name: buildMCPRegistryToolName(serverName, tool.name),
        description: `[MCP ${serverName}/${tool.name}] ${tool.description}`,
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
        requiresConfirm: true,
        execute: async (args) => {
          try {
            const result = await client.callTool(tool.name, args);
            return resultToToolResult(serverName, tool.name, result);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              success: false,
              error: `MCP tool ${serverName}/${tool.name} failed: ${message}`,
            };
          }
        },
      });
    }
  }
}
```

- [ ] **Step 5: Run MCP manager tests and verify they pass**

Run:

```powershell
npm test -- tests/unit/tools/mcp/manager.test.ts
```

Expected: all MCP manager tests pass.

- [ ] **Step 6: Run typecheck to catch SDK import issues**

Run:

```powershell
npm run typecheck
```

Expected: typecheck passes. If SDK v1 types require a small import-path adjustment, keep the public `MCPClientLike` and manager API unchanged and update only `src/tools/mcp/client.ts`.

- [ ] **Step 7: Commit MCP client and manager**

Run:

```powershell
git add src/tools/mcp tests/unit/tools/mcp
git commit -m "feat: add mcp server manager"
```

Expected: commit succeeds with MCP files only.

---

## Task 6: MCP Startup, Shutdown, and Status Surface

**Files:**

- Modify: `src/cli/chat.ts`
- Modify: `tests/unit/chat.test.ts`
- Modify: `docs/方案设计文档.md`

- [ ] **Step 1: Mock MCP manager in chat tests**

Add this hoisted mock near the existing `providerMocks` in `tests/unit/chat.test.ts`:

```ts
const mcpManagerMocks = vi.hoisted(() => ({
  startAll: vi.fn(),
  stopAll: vi.fn(),
  getSummary: vi.fn(() => ({ servers: 0, tools: 0 })),
}));
```

Add this module mock after the LLM registry mock:

```ts
vi.mock('../../src/tools/mcp/manager.js', () => ({
  MCPServerManager: vi.fn(() => ({
    startAll: mcpManagerMocks.startAll,
    stopAll: mcpManagerMocks.stopAll,
    getSummary: mcpManagerMocks.getSummary,
  })),
}));
```

In each `beforeEach`, add:

```ts
    mcpManagerMocks.startAll.mockResolvedValue(undefined);
    mcpManagerMocks.stopAll.mockResolvedValue(undefined);
    mcpManagerMocks.getSummary.mockReturnValue({ servers: 0, tools: 0 });
```

- [ ] **Step 2: Write failing startup/status tests**

Append these tests inside `describe('runPrompt', ...)` in `tests/unit/chat.test.ts`:

```ts
  it('starts and stops MCP servers in prompt mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { runPrompt } = await import('../../src/cli/chat.js');

    await runPrompt(
      {
        model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
        mcpServers: {
          filesystem: { command: 'node', args: ['server.js'] },
        },
      } as any,
      'hello from prompt',
    );

    expect(mcpManagerMocks.startAll).toHaveBeenCalledTimes(1);
    expect(mcpManagerMocks.stopAll).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });
```

Append this test inside `describe('startChat', ...)`:

```ts
  it('shows MCP summary in the welcome output', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mcpManagerMocks.getSummary.mockReturnValue({ servers: 1, tools: 2 });
    const { startChat } = await import('../../src/cli/chat.js');

    mockRl.on.mockImplementation(() => {});

    await startChat({
      model: { provider: 'deepseek', model: 'test', apiKey: 'sk-test' },
      mcpServers: {
        filesystem: { command: 'node', args: ['server.js'] },
      },
    } as any);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MCP: 1 server / 2 tools'));

    logSpy.mockRestore();
  });
```

- [ ] **Step 3: Run chat MCP tests and verify they fail**

Run:

```powershell
npm test -- tests/unit/chat.test.ts
```

Expected: fail because `src/cli/chat.ts` does not create or use `MCPServerManager` yet.

- [ ] **Step 4: Import and start MCP manager in chat flows**

Add this import to `src/cli/chat.ts`:

```ts
import { MCPServerManager, type MCPSummary } from "../tools/mcp/manager.js";
```

Update `displayWelcome` signature:

```ts
function displayWelcome(config: Config, provider: LLMProvider, mode: ChatMode, mcp: MCPSummary): void {
```

Add status lines to the welcome template:

```ts
${chalk.cyan("│")}  Mode: ${chalk.green(mode)}
${chalk.cyan("│")}  MCP: ${chalk.green(`${mcp.servers} server / ${mcp.tools} tools`)}
```

In `runPrompt`, after creating `toolRegistry`, add:

```ts
  const mcpManager = new MCPServerManager(config.mcpServers, toolRegistry, {
    onWarning: (message) => console.log(chalk.yellow(message)),
  });
  await mcpManager.startAll();
```

Wrap prompt execution in a `try`/`finally` so cleanup always runs:

```ts
  try {
    try {
      await handler.run(prompt, {
        provider,
        toolRegistry,
        messages,
        config,
        usageTracker,
        timing,
        skipConfirm: Boolean(config.yolo),
        confirmToolCall: async () => false,
        output: {
          onAssistantMessage: (content) => {
            console.log(content);
          },
          onTokenUsage: (usage) => {
            console.log(
              chalk.gray(`Token: input ${usage.promptTokens} / output ${usage.completionTokens}`),
            );
          },
          onWarning: (message) => {
            console.log(chalk.yellow(`\n${message}`));
          },
        },
      });
    } catch (error) {
      displayError(error);
    }
  } finally {
    await mcpManager.stopAll();
  }
```

In `startChat`, after creating `toolRegistry`, add:

```ts
  const mcpManager = new MCPServerManager(config.mcpServers, toolRegistry, {
    onWarning: (message) => console.log(chalk.yellow(message)),
  });
  await mcpManager.startAll();
```

Update the welcome call:

```ts
  displayWelcome(config, provider, mode, mcpManager.getSummary());
```

Update the `rl.on("close", ...)` callback to be async and stop MCP:

```ts
  rl.on("close", async () => {
    process.stdin.removeListener("keypress", onKeypress);
    clearSuggestionBlock();
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(false);
    }
    await mcpManager.stopAll();
    console.log();
    process.exit(0);
  });
```

- [ ] **Step 5: Run chat MCP tests and verify they pass**

Run:

```powershell
npm test -- tests/unit/chat.test.ts
```

Expected: all chat tests pass.

- [ ] **Step 6: Update Phase 1d checklist in the project design document**

In `docs/方案设计文档.md`, update only the Phase 1d task checkboxes for items implemented in this phase:

```text
  [x] 实现 ModeRouter
  [x] 实现 Normal 模式（1 轮 LLM + 工具）
  [x] 实现 Auto 模式（多轮 LLM + 工具，maxIterations）
  [x] 实现 Slash 命令（/mode /model /clear /help /usage）
  [x] 实现 MCP Server 管理（stdio 传输）
  [x] 实现 MCP 工具自动发现
  [x] 实现状态栏（模式/模型/上下文显示）
```

Do not mark "完善 TUI 交互" or "端到端业务流程跑通" until full verification completes.

- [ ] **Step 7: Run all unit tests**

Run:

```powershell
npm test
```

Expected: all unit tests pass; integration tests that are skipped remain skipped.

- [ ] **Step 8: Commit MCP integration**

Run:

```powershell
git add src/cli/chat.ts tests/unit/chat.test.ts docs/方案设计文档.md
git commit -m "feat: integrate mcp tools into chat"
```

Expected: commit succeeds with chat integration and design checklist updates.

---

## Task 7: Full Verification and Final Phase Commit

**Files:**

- Modify: `docs/superpowers/plans/2026-07-18-phase-1d-normal-auto-mcp.md`
- Modify: `docs/方案设计文档.md`

- [ ] **Step 1: Run full test suite**

Run:

```powershell
npm test
```

Expected: all tests pass; any skipped tests are reported as skipped, not failed.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm run lint
```

Expected: Biome exits with code 0.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: TypeScript exits with code 0.

- [ ] **Step 4: Run build**

Run:

```powershell
npm run build
```

Expected: tsup exits with code 0 and writes `dist`.

- [ ] **Step 5: Check working tree and staged changes**

Run:

```powershell
git status --short
```

Expected: only intended tracked files are modified and the unrelated `.idea/` and `login-app/` directories remain untracked.

- [ ] **Step 6: Mark final Phase 1d checklist items complete**

If Steps 1-4 pass, update `docs/方案设计文档.md`:

```text
  [x] 完善 TUI 交互
  [x] 验证：端到端业务流程跑通
```

Also update this plan file by checking the completed task boxes.

- [ ] **Step 7: Commit verification updates**

Run:

```powershell
git add docs/方案设计文档.md docs/superpowers/plans/2026-07-18-phase-1d-normal-auto-mcp.md
git commit -m "docs: mark phase 1d complete"
```

Expected: commit succeeds with documentation status updates.

- [ ] **Step 8: Report final state**

Run:

```powershell
git log -5 --oneline
git status --short
```

Expected:

- Latest commits include the Phase 1d implementation commits.
- Tracked working tree is clean.
- `.idea/` and `login-app/` remain untracked unless the user explicitly asks to include them.

---

## Self-Review Checklist

- Spec coverage:
  - ModeRouter: Task 2.
  - Normal/Auto behavior split: Task 2 and Task 3.
  - `/usage`: Task 1 and Task 3.
  - MCP SDK dependency: Task 4.
  - MCP stdio manager and discovery: Task 5.
  - MCP registration into `ToolRegistry`: Task 5.
  - MCP startup/shutdown in prompt and chat flows: Task 6.
  - Status surface: Task 6.
  - Verification and checklist updates: Task 7.
- Type consistency:
  - `UsageTracker`, `UsageSnapshot`, `RunContext`, `ModeRunResult`, `ModeRouter`, `MCPClientLike`, `MCPServerManager`, and `MCPSummary` are defined before use.
  - Mode caps are consistently `10` for Normal and `25` for Auto.
  - MCP registered tool names consistently use `buildMCPRegistryToolName`.
- Constraints:
  - Use `apply_patch` for manual file edits.
  - Use `pnpm add` for dependency lockfile updates.
  - Use `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` for verification.
  - Do not touch unrelated untracked directories.
