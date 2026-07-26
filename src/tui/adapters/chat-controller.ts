import { randomUUID } from "node:crypto";
import { InteractionEventBridge } from "../../interaction/bridge.js";
import { InteractionEventEmitter } from "../../interaction/emitter.js";
import {
  createConfirmToolCallWithInteraction,
  createTrackedMessagesHandler,
  toToolCall,
} from "../../interaction/runtime.js";
import { CostTracker } from "../../llm/cost-tracker.js";
import type { LLMProvider } from "../../llm/provider.js";
import { createProviderFromConfig } from "../../llm/registry.js";
import type { ModeHandler, ModeRunResult } from "../../modes/handler.js";
import { executeApprovedPlan } from "../../modes/plan.js";
import { ModeRouter } from "../../modes/router.js";
import { createTaskTiming } from "../../session/execution.js";
import { SessionPersistence } from "../../session/persistence.js";
import { createSessionState, createSessionSummary } from "../../session/runtime.js";
import { UsageTracker } from "../../session/usage.js";
import { resolveWorkspace, type WorkspaceInfo } from "../../session/workspace.js";
import { createDefaultToolRegistry } from "../../tools/built-in/index.js";
import { MCPServerManager } from "../../tools/mcp/manager.js";
import { ToolRegistry } from "../../tools/registry.js";
import type { Config } from "../../types/config.js";
import type { ChatMode } from "../../types/mode.js";
import type { PlanState } from "../../types/plan.js";
import type { LLMMessage, LLMToolCall } from "../../types/provider.js";
import type { SessionState, SessionStatus } from "../../types/session.js";
import type { ToolResult } from "../../types/tool.js";

export interface TUIChatController {
  submitTask(input: string): Promise<TUIChatSubmitResult>;
}

export interface TUIChatSubmitResult {
  taskId: string;
  status: "completed" | "awaiting_approval" | "failed";
  detail?: string;
}

type ChatPersistence = Pick<
  SessionPersistence,
  "initialize" | "updateStatus" | "handleMessagesChanged" | "handlePlanStateChanged"
> &
  Partial<Pick<SessionPersistence, "hydrate">>;

export interface TUIChatControllerDependencies {
  eventEmitter?: InteractionEventEmitter;
  provider?: LLMProvider;
  toolRegistry?: ToolRegistry;
  modeRouter?: Pick<ModeRouter, "getHandler">;
  persistence?: ChatPersistence;
  resolveWorkspace?: (cwd: string) => Promise<WorkspaceInfo>;
  usageTracker?: UsageTracker;
  costTracker?: CostTracker;
  cwd?: string;
  now?: () => string;
  createTaskId?: () => string;
  createSessionId?: () => string;
  mcpManager?: Pick<MCPServerManager, "startAll">;
}

const PLAN_APPROVAL_INPUTS = new Set(["y", "yes", "确认", "执行", "继续"]);
const PLAN_REJECT_INPUTS = new Set(["n", "no", "取消", "停止"]);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPlanApprovalInput(input: string): boolean {
  return PLAN_APPROVAL_INPUTS.has(input.trim().toLowerCase());
}

function isPlanRejectInput(input: string): boolean {
  return PLAN_REJECT_INPUTS.has(input.trim().toLowerCase());
}

class DefaultTUIChatController implements TUIChatController {
  private readonly emitter: InteractionEventEmitter;
  private readonly interaction: InteractionEventBridge;
  private readonly usageTracker: UsageTracker;
  private readonly costTracker: CostTracker;
  private readonly modeRouter: Pick<ModeRouter, "getHandler">;
  private readonly resolveWorkspaceForCwd: (cwd: string) => Promise<WorkspaceInfo>;
  private readonly now: () => string;
  private readonly createTaskId: () => string;
  private readonly createSessionId: () => string;
  private readonly cwd: string;
  private readonly persistence: ChatPersistence;
  private readonly trackedMessages;

  private provider?: LLMProvider;
  private toolRegistry?: ToolRegistry;
  private mcpManager?: Pick<MCPServerManager, "startAll">;
  private initialized?: Promise<void>;
  private runtimeSession?: SessionState;
  private lastSessionDigest?: string;
  private activeSubmission?: Promise<TUIChatSubmitResult>;
  private messages: LLMMessage[] = [];
  private pendingPlan?: PlanState;
  private status: SessionStatus = "idle";
  private readonly mode: ChatMode;

  constructor(
    private readonly config: Config,
    private readonly dependencies: TUIChatControllerDependencies = {},
  ) {
    this.emitter = dependencies.eventEmitter ?? new InteractionEventEmitter();
    this.interaction = new InteractionEventBridge(this.emitter, () => this.now());
    this.usageTracker = dependencies.usageTracker ?? new UsageTracker();
    this.costTracker = dependencies.costTracker ?? new CostTracker(config.costGuard);
    this.modeRouter = dependencies.modeRouter ?? new ModeRouter();
    this.resolveWorkspaceForCwd = dependencies.resolveWorkspace ?? resolveWorkspace;
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.createTaskId = dependencies.createTaskId ?? randomUUID;
    this.createSessionId = dependencies.createSessionId ?? randomUUID;
    this.cwd = dependencies.cwd ?? process.cwd();
    this.mode = (config.mode as ChatMode) ?? "normal";
    this.persistence =
      dependencies.persistence ??
      new SessionPersistence({
        enabled: config.sessions?.enabled !== false,
        storePath: config.sessions?.storePath,
        kind: "interactive",
        cwd: this.cwd,
        usageTracker: this.usageTracker,
        costTracker: this.costTracker,
        getMode: () => this.mode,
        getMessages: () => this.messages,
        getPendingPlan: () => this.pendingPlan,
      });
    this.trackedMessages = createTrackedMessagesHandler(
      this.interaction,
      (nextMessages) => this.persistence.handleMessagesChanged(nextMessages),
      this.messages.length,
    );
  }

  async submitTask(input: string): Promise<TUIChatSubmitResult> {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("Cannot submit an empty task.");
    }

    if (this.activeSubmission) {
      throw new Error("A task is already running in the TUI shell.");
    }

    const taskId = this.createTaskId();
    const submission = this.runTask(taskId, trimmed).finally(() => {
      this.activeSubmission = undefined;
    });
    this.activeSubmission = submission;
    return submission;
  }

  private async runTask(taskId: string, input: string): Promise<TUIChatSubmitResult> {
    await this.ensureInitialized();
    await this.ensureRuntimeSession();

    this.interaction.taskUpdated({
      id: taskId,
      title: input,
      status: "running",
      mode: this.mode,
    });
    await this.updateStatus("running");

    const handler = this.modeRouter.getHandler(this.mode);
    let lastWarning: string | undefined;

    const runContext = {
      provider: this.getProvider(),
      toolRegistry: this.getToolRegistry(),
      messages: this.messages,
      config: this.config,
      usageTracker: this.usageTracker,
      costTracker: this.costTracker,
      timing: createTaskTiming(),
      skipConfirm: Boolean(this.config.yolo),
      confirmToolCall: createConfirmToolCallWithInteraction(this.interaction, async () => false),
      onMessagesChanged: async (nextMessages: LLMMessage[]) => {
        this.messages = [...nextMessages];
        await this.trackedMessages.handleMessagesChanged(this.messages);
        this.emitSessionSummary();
      },
      onPlanStateChanged: async (plan?: PlanState) => {
        this.pendingPlan = plan;
        await this.persistence.handlePlanStateChanged(plan);
        this.emitSessionSummary();
      },
      onStatusChanged: async (status: SessionStatus, reason?: string) => {
        await this.updateStatus(status, reason);
      },
      output: {
        onToolStart: (toolCall: LLMToolCall) => {
          this.interaction.toolStarted(
            toToolCall(toolCall),
            Boolean(this.getToolRegistry().get(toolCall.name)?.requiresConfirm),
          );
        },
        onToolResult: (toolCall: LLMToolCall, result: ToolResult) => {
          this.interaction.toolFinished(toToolCall(toolCall), result);
        },
        onWarning: (message: string) => {
          lastWarning = message;
        },
      },
    };

    try {
      const result = await this.executeTaskInput(input, handler, runContext);
      const taskStatus = result.reachedLimit
        ? "failed"
        : result.planState
          ? "awaiting_approval"
          : "completed";
      const detail = result.reachedLimit ? lastWarning ?? "Reached max execution steps." : result.detail;

      this.interaction.taskUpdated({
        id: taskId,
        title: input,
        status: taskStatus,
        mode: this.mode,
        detail,
      });

      return {
        taskId,
        status: taskStatus,
        detail,
      };
    } catch (error) {
      await this.updateStatus("idle");
      const detail = getErrorMessage(error);
      this.interaction.taskUpdated({
        id: taskId,
        title: input,
        status: "failed",
        mode: this.mode,
        detail,
      });
      throw error;
    }
  }

  private async executeTaskInput(
    input: string,
    handler: ModeHandler,
    runContext: Parameters<ModeHandler["run"]>[1],
  ): Promise<ModeRunResult & { detail?: string }> {
    if (this.mode === "plan" && this.pendingPlan) {
      if (isPlanApprovalInput(input)) {
        const approvedPlan = this.pendingPlan;
        const result = await executeApprovedPlan(approvedPlan, runContext, handler.maxIterations);
        this.pendingPlan = undefined;
        await this.persistence.handlePlanStateChanged(undefined);
        await this.updateStatus("idle");
        return {
          ...result,
          detail: "Plan approved and executed.",
        };
      }

      if (isPlanRejectInput(input)) {
        this.pendingPlan = undefined;
        await this.persistence.handlePlanStateChanged(undefined);
        await this.updateStatus("idle");
        this.emitSessionSummary();
        return {
          iterations: 0,
          reachedLimit: false,
          detail: "Plan cancelled.",
        };
      }

      const result = await handler.run(
        `${this.pendingPlan.originalTask}\n\nUser feedback: ${input}`,
        runContext,
      );
      this.pendingPlan = result.planState;
      await this.persistence.handlePlanStateChanged(result.planState);
      await this.updateStatus("awaiting_plan_approval");
      return {
        ...result,
        detail: result.planState?.summary,
      };
    }

    const result = await handler.run(input, runContext);
    this.pendingPlan = result.planState;
    await this.persistence.handlePlanStateChanged(result.planState);
    await this.updateStatus(result.planState ? "awaiting_plan_approval" : "idle");
    return {
      ...result,
      detail: result.planState?.summary,
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        await this.persistence.initialize();
        if (!this.dependencies.mcpManager && !this.config.mcpServers) {
          return;
        }

        const mcpManager = this.getMCPManager();
        await mcpManager.startAll();
      })();
    }

    await this.initialized;
  }

  private async ensureRuntimeSession(): Promise<SessionState> {
    if (this.runtimeSession) {
      return this.runtimeSession;
    }

    const workspace = await this.resolveWorkspaceForCwd(this.cwd);
    const session = createSessionState({
      sessionId: this.createSessionId(),
      kind: "interactive",
      mode: this.mode,
      workspaceKey: workspace.key,
      workspacePath: workspace.path,
      now: this.now(),
    });
    this.runtimeSession = {
      ...session,
      title: "",
    };
    this.persistence.hydrate?.(this.runtimeSession);
    this.emitSessionSummary();
    return this.runtimeSession;
  }

  private emitSessionSummary(): void {
    const session = this.syncRuntimeSession();
    if (!session) {
      return;
    }

    const summary = createSessionSummary(session);
    const digest = JSON.stringify(summary);
    if (digest === this.lastSessionDigest) {
      return;
    }

    this.lastSessionDigest = digest;
    this.interaction.sessionChanged(summary);
  }

  private syncRuntimeSession(): SessionState | undefined {
    if (!this.runtimeSession) {
      return undefined;
    }

    const now = this.now();
    this.runtimeSession = {
      ...this.runtimeSession,
      mode: this.mode,
      messages: [...this.messages],
      pendingPlan: this.pendingPlan,
      status: this.status,
      updatedAt: now,
      lastActiveAt: now,
      title: "",
    };
    return this.runtimeSession;
  }

  private async updateStatus(status: SessionStatus, reason?: string): Promise<void> {
    await this.ensureRuntimeSession();
    this.status = status;
    await this.persistence.updateStatus(status, reason);
    this.emitSessionSummary();
  }

  private getProvider(): LLMProvider {
    if (!this.provider) {
      this.provider = this.dependencies.provider ?? createProviderFromConfig(this.config);
    }

    return this.provider;
  }

  private getToolRegistry(): ToolRegistry {
    if (!this.toolRegistry) {
      this.toolRegistry = this.dependencies.toolRegistry ?? createDefaultToolRegistry();
    }

    return this.toolRegistry;
  }

  private getMCPManager(): Pick<MCPServerManager, "startAll"> {
    if (!this.mcpManager) {
      this.mcpManager =
        this.dependencies.mcpManager ??
        new MCPServerManager(this.config.mcpServers, this.getToolRegistry(), {
          onWarning: () => undefined,
        });
    }

    return this.mcpManager;
  }
}

export function createTUIChatController(
  config: Config,
  dependencies: TUIChatControllerDependencies = {},
): TUIChatController {
  return new DefaultTUIChatController(config, dependencies);
}
