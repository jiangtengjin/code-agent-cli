import { randomUUID } from "node:crypto";
import { getGlobalConfigPath, loadConfigFile, writeConfigFile } from "../../config/manager.js";
import { InteractionEventBridge } from "../../interaction/bridge.js";
import { InteractionEventEmitter } from "../../interaction/emitter.js";
import type {
  ConfigValidationIssue,
  ConfigValidationSnapshot,
  ReviewFinding,
} from "../../interaction/events.js";
import { createTrackedMessagesHandler, toToolCall } from "../../interaction/runtime.js";
import { CostTracker } from "../../llm/cost-tracker.js";
import type { LLMProvider } from "../../llm/provider.js";
import { createProviderFromConfig } from "../../llm/registry.js";
import type { ModeHandler, ModeRunResult } from "../../modes/handler.js";
import { executeApprovedPlan } from "../../modes/plan.js";
import { ModeRouter } from "../../modes/router.js";
import { createTaskTiming } from "../../session/execution.js";
import { SessionPersistence } from "../../session/persistence.js";
import {
  createSessionState,
  createSessionSummary,
  forkSessionState,
} from "../../session/runtime.js";
import { SessionStore } from "../../session/store.js";
import { UsageTracker } from "../../session/usage.js";
import { type WorkspaceInfo, resolveWorkspace } from "../../session/workspace.js";
import { createDefaultToolRegistry } from "../../tools/built-in/index.js";
import { MCPServerManager } from "../../tools/mcp/manager.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { Config } from "../../types/config.js";
import type { ChatMode } from "../../types/mode.js";
import type { PlanState } from "../../types/plan.js";
import type { LLMMessage, LLMToolCall } from "../../types/provider.js";
import type { SessionState, SessionStatus, SessionSummary } from "../../types/session.js";
import type { ToolResult } from "../../types/tool.js";
import { findShellCommand, resolveSceneQuery } from "../shell/router.js";
import type { TUIScene } from "../types.js";

export interface TUIChatControllerInitializeOptions {
  initialScene?: TUIScene;
  startOptions?: {
    continueLast?: boolean;
    resumeLast?: boolean;
    resumeAll?: boolean;
    resumeQuery?: string;
    resumePicker?: boolean;
    resumeFork?: boolean;
    plainUi?: boolean;
    noAltScreen?: boolean;
    initialScene?: TUIScene;
  };
}

type TUIChatControllerStartOptions = NonNullable<
  TUIChatControllerInitializeOptions["startOptions"]
>;

export interface TUICommandResult {
  handled: boolean;
  note?: string;
  navigateTo?: TUIScene;
}

export interface TUIChatController {
  initialize(options?: TUIChatControllerInitializeOptions): Promise<void>;
  submitTask(input: string): Promise<TUIChatSubmitResult>;
  executeCommand(input: string): Promise<TUICommandResult>;
  dispose(): void;
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

type ReviewScanner = () => Promise<ReviewFinding[]>;

type PendingApproval = {
  taskId?: string;
  taskTitle?: string;
  resolve: (approved: boolean) => void;
};

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
  sessionsStorePath?: string;
  configPath?: string;
  reviewScanner?: ReviewScanner;
}

const PLAN_APPROVAL_INPUTS = new Set(["y", "yes", "纭", "鎵ц", "缁х画"]);
const PLAN_REJECT_INPUTS = new Set(["n", "no", "鍙栨秷", "鍋滄"]);
const MODE_NAMES: ChatMode[] = ["normal", "auto", "plan", "edit"];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPlanApprovalInput(input: string): boolean {
  return PLAN_APPROVAL_INPUTS.has(input.trim().toLowerCase());
}

function isPlanRejectInput(input: string): boolean {
  return PLAN_REJECT_INPUTS.has(input.trim().toLowerCase());
}

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  const matcher = /"([^"]*)"|'([^']*)'|(\S+)/gu;

  for (const match of input.matchAll(matcher)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }

  return tokens;
}

function cloneConfig(config: Config): Config {
  return structuredClone(config);
}

function parseCommandValue(rawValue: string): unknown {
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  if (rawValue === "null") {
    return null;
  }
  if (/^-?\d+(?:\.\d+)?$/u.test(rawValue)) {
    return Number(rawValue);
  }
  if (
    (rawValue.startsWith("{") && rawValue.endsWith("}")) ||
    (rawValue.startsWith("[") && rawValue.endsWith("]"))
  ) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }

  return rawValue;
}

function setConfigValue(config: Config, path: string, value: unknown): void {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Config path cannot be empty.");
  }

  let cursor = config as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const nextValue = cursor[segment];
    if (typeof nextValue !== "object" || nextValue === null || Array.isArray(nextValue)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]] = value;
}

function createConfigDiff(previousConfig: Config, nextConfig: Config): string | undefined {
  const previousText = JSON.stringify(previousConfig, null, 2);
  const nextText = JSON.stringify(nextConfig, null, 2);
  if (previousText === nextText) {
    return undefined;
  }

  const previousLines = previousText.split("\n");
  const nextLines = nextText.split("\n");
  const maxLineCount = Math.max(previousLines.length, nextLines.length);
  const diffLines: string[] = [];

  for (let index = 0; index < maxLineCount; index += 1) {
    const previousLine = previousLines[index];
    const nextLine = nextLines[index];
    if (previousLine === nextLine) {
      continue;
    }

    if (previousLine !== undefined) {
      diffLines.push(`-${previousLine}`);
    }
    if (nextLine !== undefined) {
      diffLines.push(`+${nextLine}`);
    }
  }

  return diffLines.join("\n");
}

function validateConfigSnapshot(config: Config): ConfigValidationSnapshot {
  const issues: ConfigValidationIssue[] = [];

  if (!config.model?.provider) {
    issues.push({
      path: "model.provider",
      message: "Provider is required.",
      severity: "error",
    });
  }

  if (!config.model?.model) {
    issues.push({
      path: "model.model",
      message: "Model is required.",
      severity: "error",
    });
  }

  return {
    status: issues.length > 0 ? "invalid" : "valid",
    issues,
  };
}

function mapSessionToResumeItem(session: SessionSummary) {
  return {
    id: session.id,
    title: session.title,
    mode: session.mode,
    status: session.status,
    updatedAt: session.updatedAt,
    workspacePath: session.workspacePath,
  };
}

function normalizeInterruptedSession(session: SessionState): {
  session: SessionState;
  resumedFromInterrupted: boolean;
} {
  if (session.status !== "interrupted") {
    return {
      session,
      resumedFromInterrupted: false,
    };
  }

  const normalized = structuredClone(session);
  normalized.status = "idle";

  if (normalized.pendingPlan) {
    for (const step of normalized.pendingPlan.steps) {
      if (step.status === "running") {
        step.status = "pending";
        step.error = undefined;
      }
    }
  }

  return {
    session: normalized,
    resumedFromInterrupted: true,
  };
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
  private readonly sessionsStorePath?: string;
  private readonly configPath: string;
  private readonly reviewScanner: ReviewScanner;

  private provider?: LLMProvider;
  private toolRegistry?: ToolRegistry;
  private mcpManager?: Pick<MCPServerManager, "startAll">;
  private sessionStore?: SessionStore;
  private initialized?: Promise<void>;
  private runtimeSession?: SessionState;
  private lastSessionDigest?: string;
  private lastRuntimeDigest?: string;
  private activeSubmission?: Promise<TUIChatSubmitResult>;
  private messages: LLMMessage[] = [];
  private pendingPlan?: PlanState;
  private status: SessionStatus = "idle";
  private mode: ChatMode;
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private activeTask?: {
    id: string;
    title: string;
  };
  private savedConfig?: Config;
  private draftConfig?: Config;

  constructor(
    private readonly config: Config,
    private readonly dependencies: TUIChatControllerDependencies = {},
  ) {
    this.emitter = dependencies.eventEmitter ?? new InteractionEventEmitter();
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.interaction = new InteractionEventBridge(this.emitter, () => this.now());
    this.usageTracker = dependencies.usageTracker ?? new UsageTracker();
    this.costTracker = dependencies.costTracker ?? new CostTracker(config.costGuard);
    this.modeRouter = dependencies.modeRouter ?? new ModeRouter();
    this.resolveWorkspaceForCwd = dependencies.resolveWorkspace ?? resolveWorkspace;
    this.createTaskId = dependencies.createTaskId ?? randomUUID;
    this.createSessionId = dependencies.createSessionId ?? randomUUID;
    this.cwd = dependencies.cwd ?? process.cwd();
    this.mode = (config.mode as ChatMode) ?? "normal";
    this.sessionsStorePath = dependencies.sessionsStorePath ?? config.sessions?.storePath;
    this.configPath = dependencies.configPath ?? getGlobalConfigPath();
    this.reviewScanner = dependencies.reviewScanner ?? (async () => []);
    this.persistence =
      dependencies.persistence ??
      new SessionPersistence({
        enabled: config.sessions?.enabled !== false,
        storePath: this.sessionsStorePath,
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

  async initialize(options: TUIChatControllerInitializeOptions = {}): Promise<void> {
    await this.ensureInitialized();

    if (options.startOptions?.continueLast || options.startOptions?.resumeLast) {
      await this.restoreLatestSession(options.startOptions);
    } else if (typeof options.startOptions?.resumeQuery === "string") {
      await this.restoreSessionByQuery(options.startOptions.resumeQuery, options.startOptions);
    }

    if (options.initialScene === "resume" || options.startOptions?.resumePicker) {
      await this.refreshResumeCatalog(options.startOptions);
    }

    if (options.initialScene === "settings" || options.initialScene === "mcp") {
      await this.loadConfigSnapshot();
    }
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
      this.activeTask = undefined;
    });
    this.activeSubmission = submission;
    return submission;
  }

  async executeCommand(input: string): Promise<TUICommandResult> {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) {
      return { handled: false };
    }

    await this.ensureInitialized();

    const tokens = tokenizeCommand(trimmed.slice(1));
    const command = tokens[0]?.toLowerCase();
    const args = tokens.slice(1);

    // 别名归一（/config -> settings、/task -> tasks 等）由路由目录统一维护，
    // 这里只处理归一后的规范名，避免两处各记一份别名表。
    const canonical = command ? (findShellCommand(command)?.name ?? command) : command;

    switch (canonical) {
      case "goto":
        return this.runGotoCommand(args);
      case "approve":
        return this.resolvePendingApproval(args[0], true);
      case "reject":
        return this.resolvePendingApproval(args[0], false);
      case "resume":
        if (args.length === 0) {
          await this.refreshResumeCatalog();
          return {
            handled: true,
            navigateTo: "resume",
            note: "resume catalog refreshed",
          };
        }
        await this.restoreSessionByQuery(args.join(" "));
        return {
          handled: true,
          navigateTo: "chat",
        };
      case "review":
        return this.runReviewCommand();
      case "settings":
        return this.runConfigCommand(args);
      case "mode":
        return this.runModeCommand(args);
      case "tasks":
        return { handled: true, navigateTo: "tasks" };
      case "approvals":
        return { handled: true, navigateTo: "approvals" };
      case "mcp":
        return { handled: true, navigateTo: "mcp" };
      default:
        return {
          handled: false,
          note: `unknown command: /${command ?? ""}`,
        };
    }
  }

  dispose(): void {
    for (const [requestId, approval] of this.pendingApprovals) {
      approval.resolve(false);
      this.pendingApprovals.delete(requestId);
    }
  }

  private async runTask(taskId: string, input: string): Promise<TUIChatSubmitResult> {
    await this.ensureInitialized();
    await this.ensureRuntimeSession();

    this.activeTask = {
      id: taskId,
      title: input,
    };

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
      confirmToolCall: (toolCall: LLMToolCall) => this.confirmToolCall(toolCall),
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
      const detail = result.reachedLimit
        ? (lastWarning ?? "Reached max execution steps.")
        : result.detail;

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

  private async confirmToolCall(toolCall: LLMToolCall): Promise<boolean> {
    this.interaction.approvalRequested({
      id: toolCall.id,
      toolCall: toToolCall(toolCall),
      title: `Confirm ${toolCall.name}`,
      summary: JSON.stringify(toolCall.args),
      risk: "high",
      workingDirectory: this.cwd,
    });

    if (this.activeTask) {
      this.interaction.taskUpdated({
        id: this.activeTask.id,
        title: this.activeTask.title,
        status: "awaiting_approval",
        mode: this.mode,
        detail: `Awaiting approval for ${toolCall.name}`,
      });
    }

    const approved = await new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(toolCall.id, {
        taskId: this.activeTask?.id,
        taskTitle: this.activeTask?.title,
        resolve,
      });
    });

    if (approved && this.activeTask) {
      this.interaction.taskUpdated({
        id: this.activeTask.id,
        title: this.activeTask.title,
        status: "running",
        mode: this.mode,
      });
    }

    return approved;
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

  private async runReviewCommand(): Promise<TUICommandResult> {
    const findings = await this.reviewScanner();
    this.interaction.reviewFindingsReady(findings);
    return {
      handled: true,
      navigateTo: "review",
      note: `review findings: ${findings.length}`,
    };
  }

  private async runConfigCommand(args: string[]): Promise<TUICommandResult> {
    if (this.draftConfig === undefined || this.savedConfig === undefined) {
      await this.loadConfigSnapshot();
    }

    const action = args[0]?.toLowerCase();
    if (!action) {
      return {
        handled: true,
        navigateTo: "settings",
        note: "config draft loaded",
      };
    }

    if (action === "mcp") {
      return {
        handled: true,
        navigateTo: "mcp",
        note: "navigated to mcp settings",
      };
    }

    if (action === "save") {
      if (!this.draftConfig) {
        throw new Error("Config snapshot is not loaded.");
      }

      writeConfigFile(this.configPath, this.draftConfig);
      this.savedConfig = cloneConfig(this.draftConfig);
      this.publishConfigState();
      return {
        handled: true,
        note: "config saved",
        navigateTo: "settings",
      };
    }

    if (action === "set") {
      const path = args[1];
      if (!path) {
        throw new Error("Config path is required.");
      }
      if (args.length < 3) {
        throw new Error("Config value is required.");
      }

      const rawValue = args.slice(2).join(" ");
      if (!this.draftConfig) {
        throw new Error("Config snapshot is not loaded.");
      }

      const nextConfig = cloneConfig(this.draftConfig);
      setConfigValue(nextConfig, path, parseCommandValue(rawValue));
      this.draftConfig = nextConfig;
      this.publishConfigState();
      return {
        handled: true,
        note: `config updated: ${path}`,
        navigateTo: "settings",
      };
    }

    if (action === "reload") {
      await this.loadConfigSnapshot();
      return {
        handled: true,
        note: "config reloaded",
        navigateTo: "settings",
      };
    }

    return {
      handled: false,
      note: `unknown config command: ${action}`,
    };
  }

  private async runModeCommand(args: string[]): Promise<TUICommandResult> {
    const nextMode = args[0] as ChatMode | undefined;
    if (!nextMode) {
      return {
        handled: true,
        note: `mode: ${this.mode}`,
      };
    }

    if (!MODE_NAMES.includes(nextMode)) {
      throw new Error(`Unknown mode: ${nextMode}`);
    }

    this.mode = nextMode;
    this.emitSessionSummary();
    return {
      handled: true,
      navigateTo: "chat",
      note: `mode: ${this.mode}`,
    };
  }

  private async runGotoCommand(args: string[]): Promise<TUICommandResult> {
    const targetScene = args[0]?.toLowerCase();
    if (!targetScene) {
      throw new Error("Scene name is required.");
    }

    // 场景解析与别名统一由路由目录负责：先按场景名/前缀解析，
    // 再回退到命令别名（`/goto config` -> settings）。
    const scene = resolveSceneQuery(targetScene) ?? findShellCommand(targetScene)?.scene;
    if (!scene) {
      return {
        handled: false,
        note: `unknown scene: ${targetScene}`,
      };
    }

    // 特殊处理 resume 场景，需要刷新目录
    if (scene === "resume") {
      await this.refreshResumeCatalog();
      return {
        handled: true,
        navigateTo: "resume",
        note: `navigated to ${scene}`,
      };
    }

    return {
      handled: true,
      navigateTo: scene,
      note: `navigated to ${scene}`,
    };
  }

  private async resolvePendingApproval(
    requestId: string | undefined,
    approved: boolean,
  ): Promise<TUICommandResult> {
    if (!requestId) {
      throw new Error("Approval id is required.");
    }

    const pendingApproval = this.pendingApprovals.get(requestId);
    if (!pendingApproval) {
      throw new Error(`Approval not found: ${requestId}`);
    }

    this.pendingApprovals.delete(requestId);
    this.interaction.approvalResolved(requestId, approved ? "approved_once" : "rejected");
    if (!approved && pendingApproval.taskId && pendingApproval.taskTitle) {
      this.interaction.taskUpdated({
        id: pendingApproval.taskId,
        title: pendingApproval.taskTitle,
        status: "failed",
        mode: this.mode,
        detail: `Approval rejected: ${requestId}`,
      });
    }
    pendingApproval.resolve(approved);

    return {
      handled: true,
      note: `${approved ? "approved" : "rejected"}: ${requestId}`,
    };
  }

  private async refreshResumeCatalog(
    startOptions: TUIChatControllerStartOptions = {},
  ): Promise<void> {
    const sessionStore = this.getSessionStore();
    if (!sessionStore) {
      this.interaction.resumeCatalogUpdated({
        items: [],
      });
      return;
    }

    const workspace = await this.getWorkspaceInfo();
    const sessions = await sessionStore.listSessions({
      workspaceKey: startOptions.resumeAll ? undefined : workspace.key,
      kind: "interactive",
    });
    this.interaction.resumeCatalogUpdated({
      items: sessions.map((session) => mapSessionToResumeItem(session)),
    });
  }

  private async restoreLatestSession(
    startOptions: TUIChatControllerStartOptions = {},
  ): Promise<void> {
    const sessionStore = this.getSessionStore();
    if (!sessionStore) {
      return;
    }

    const workspace = await this.getWorkspaceInfo();
    const summary = await sessionStore.findLatestSession({
      workspaceKey: workspace.key,
      kind: "interactive",
      includeAllWorkspaces: Boolean(startOptions.resumeAll),
    });
    if (!summary) {
      return;
    }

    await this.restoreSessionSummary(summary, startOptions);
  }

  private async restoreSessionByQuery(
    query: string,
    startOptions: TUIChatControllerStartOptions = {},
  ): Promise<void> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new Error("Resume query cannot be empty.");
    }

    const sessionStore = this.getSessionStore();
    if (!sessionStore) {
      throw new Error("Session persistence is not configured.");
    }

    const workspace = await this.getWorkspaceInfo();
    const summary = await sessionStore.findSessionByQuery(normalizedQuery, {
      workspaceKey: workspace.key,
      kind: "interactive",
      includeAllWorkspaces: Boolean(startOptions.resumeAll),
    });
    if (!summary) {
      throw new Error(`Session not found: ${normalizedQuery}`);
    }

    await this.restoreSessionSummary(summary, startOptions);
  }

  private async restoreSessionSummary(
    summary: SessionSummary,
    startOptions: TUIChatControllerStartOptions = {},
  ): Promise<void> {
    const sessionStore = this.getSessionStore();
    const loadedSession = await sessionStore?.loadSession(summary.id);
    if (!loadedSession || !sessionStore) {
      throw new Error(`Session not found: ${summary.id}`);
    }

    const normalized = normalizeInterruptedSession(loadedSession);
    const restoredSession = startOptions.resumeFork
      ? await this.forkLoadedSession(sessionStore, normalized.session)
      : normalized.session;

    this.runtimeSession = structuredClone(restoredSession);
    this.messages = [...restoredSession.messages];
    this.pendingPlan = restoredSession.pendingPlan;
    this.status = restoredSession.status;
    this.mode = restoredSession.mode;
    this.usageTracker.restore(restoredSession.usage);
    this.costTracker.restore(restoredSession.cost);
    this.persistence.hydrate?.(this.runtimeSession);
    this.lastSessionDigest = undefined;
    this.emitSessionSummary();
    for (const message of this.messages) {
      this.interaction.messageAdded(message);
    }
    this.trackedMessages.setTrackedCount(this.messages.length);
    this.interaction.resumeLoaded(restoredSession.sessionId, {
      resumedFromInterrupted: normalized.resumedFromInterrupted,
      forkedFromSessionId: restoredSession.parentSessionId,
    });
  }

  private async forkLoadedSession(
    sessionStore: SessionStore,
    source: SessionState,
  ): Promise<SessionState> {
    const now = this.now();
    const forked = forkSessionState(source, {
      sessionId: this.createSessionId(),
      now,
    });

    await sessionStore.saveSession(forked);
    await sessionStore.appendEvent(forked.sessionId, {
      type: "fork",
      createdAt: now,
      parentSessionId: source.sessionId,
    });

    return forked;
  }

  private async loadConfigSnapshot(): Promise<void> {
    let loadedConfig: Config;
    try {
      loadedConfig = loadConfigFile(this.configPath);
    } catch {
      loadedConfig = cloneConfig(this.config);
    }

    this.savedConfig = cloneConfig(loadedConfig);
    this.draftConfig = cloneConfig(loadedConfig);
    this.publishConfigState();
  }

  private publishConfigState(): void {
    if (!this.savedConfig || !this.draftConfig) {
      return;
    }

    const diff = createConfigDiff(this.savedConfig, this.draftConfig);
    this.interaction.configSnapshotUpdated({
      filePath: this.configPath,
      config: cloneConfig(this.draftConfig),
      dirty: diff !== undefined,
      diff,
      updatedAt: this.now(),
    });
    this.interaction.configValidationUpdated(validateConfigSnapshot(this.draftConfig));
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

  private async getWorkspaceInfo(): Promise<WorkspaceInfo> {
    if (this.runtimeSession) {
      return {
        key: this.runtimeSession.workspaceKey,
        path: this.runtimeSession.workspacePath,
      };
    }

    return this.resolveWorkspaceForCwd(this.cwd);
  }

  private getSessionStore(): SessionStore | undefined {
    if (!this.sessionsStorePath) {
      return undefined;
    }

    if (!this.sessionStore) {
      this.sessionStore = new SessionStore(this.sessionsStorePath);
    }

    return this.sessionStore;
  }

  /**
   * 推送模型、token 与费用快照。
   *
   * `/status` 面板和状态栏都读这份数据，所以在每次会话摘要变化时一并更新，
   * 保证「用了多少」不会落后于对话本身。
   */
  private emitRuntimeUsage(): void {
    const runtime = {
      modelName: this.config.model?.model ?? "n/a",
      usage: this.usageTracker.snapshot(),
      cost: this.costTracker.snapshot(),
    };
    const digest = JSON.stringify(runtime);
    if (digest === this.lastRuntimeDigest) {
      return;
    }

    this.lastRuntimeDigest = digest;
    this.interaction.runtimeUsageUpdated(runtime);
  }

  private emitSessionSummary(): void {
    this.emitRuntimeUsage();
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
