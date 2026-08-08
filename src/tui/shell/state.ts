import type {
  ApprovalRequest,
  ApprovalResolution,
  ConfigSnapshot,
  ConfigValidationSnapshot,
  ConfigValidationStatus,
  InteractionTaskSnapshot,
  InteractionTaskStatus,
  MCPHealthSnapshot,
  ResumeCatalogSnapshot,
  ReviewFinding,
  RuntimeUsageSnapshot,
} from "../../interaction/events.js";
import type { LLMMessage } from "../../types/provider.js";
import type { SessionStatus, SessionSummary } from "../../types/session.js";
import type { ToolCall, ToolResult } from "../../types/tool.js";
import type { TUIScene } from "../types.js";
import { ROOT_SCENE } from "./router.js";

export interface ShellMessageEntry {
  id: string;
  createdAt: string;
  role: LLMMessage["role"];
  text: string;
  message: LLMMessage;
}

export type ShellToolStatus = "running" | "completed" | "failed";

export interface ShellToolEntry {
  id: string;
  name: string;
  toolCall: ToolCall;
  requiresApproval: boolean;
  status: ShellToolStatus;
  startedAt: string;
  finishedAt?: string;
  result?: ToolResult;
}

export type ShellApprovalStatus = "pending" | ApprovalResolution;

export interface ShellApprovalEntry {
  id: string;
  title: string;
  summary: string;
  status: ShellApprovalStatus;
  risk: ApprovalRequest["risk"];
  requestedAt: string;
  resolvedAt?: string;
  reason?: string;
  request?: ApprovalRequest;
}

export interface ShellTaskEntry extends InteractionTaskSnapshot {
  updatedAt: string;
}

export interface ShellResumeState {
  sessionId: string;
  resumedFromInterrupted: boolean;
  forkedFromSessionId?: string;
  loadedAt: string;
}

export type ShellResumeCatalogState = ResumeCatalogSnapshot;

export type ShellConfigSnapshotState = ConfigSnapshot;

export interface ShellChatState {
  messages: ShellMessageEntry[];
  tools: ShellToolEntry[];
}

export interface ShellApprovalState {
  items: ShellApprovalEntry[];
}

export interface ShellState {
  activeScene: TUIScene;
  currentSession?: SessionSummary;
  chat: ShellChatState;
  approvals: ShellApprovalState;
  tasks: ShellTaskEntry[];
  resume?: ShellResumeState;
  resumeCatalog?: ShellResumeCatalogState;
  reviewFindings: ReviewFinding[];
  configSnapshot?: ShellConfigSnapshotState;
  configValidation: ConfigValidationSnapshot;
  mcpServers: MCPHealthSnapshot[];
  runtime?: RuntimeUsageSnapshot;
  lastEventAt?: string;
}

/**
 * `/status` 面板数据。
 *
 * 取代了原先的 home 场景：同样的总览信息，但作为对话之上的一次性面板呈现，
 * 用户不必离开对话就能看完，Esc 即回。
 */
export interface StatusSummary {
  sessionTitle: string;
  sessionId?: string;
  sessionStatus?: SessionStatus;
  mode?: SessionSummary["mode"];
  workspacePath: string;
  modelName: string;
  messageCount: number;
  turnCount: number;
  runningToolCount: number;
  pendingApprovalCount: number;
  resolvedApprovalCount: number;
  reviewFindingCount: number;
  lastResumeSessionId?: string;
  taskCounts: Record<InteractionTaskStatus, number>;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: number;
  currency: string;
  totalCost?: number;
  healthyMcpServerCount: number;
  totalMcpServerCount: number;
  configStatus: ConfigValidationStatus;
  configIssueCount: number;
}

export interface StatusBarSummary {
  activeScene: TUIScene;
  mode?: SessionSummary["mode"];
  sessionStatus?: SessionStatus;
  workspacePath: string;
  modelName: string;
  pendingApprovalCount: number;
  activeTaskCount: number;
  totalTokens: number;
  currency: string;
  totalCost?: number;
  lastEventAt?: string;
}

export interface TaskBoardSummary {
  sessionTitle: string;
  sessionStatus?: SessionStatus;
  active: ShellTaskEntry[];
  queued: ShellTaskEntry[];
  finished: ShellTaskEntry[];
  counts: Record<InteractionTaskStatus, number>;
  activeCount: number;
  queuedCount: number;
  finishedCount: number;
  focusedTaskId?: string;
}

function isActiveTask(task: ShellTaskEntry): boolean {
  return task.status === "running" || task.status === "awaiting_approval";
}

const DEFAULT_CONFIG_VALIDATION: ConfigValidationSnapshot = {
  status: "idle",
  issues: [],
};

export function createInitialShellState(overrides: Partial<ShellState> = {}): ShellState {
  const baseState: ShellState = {
    activeScene: ROOT_SCENE,
    chat: {
      messages: [],
      tools: [],
    },
    approvals: {
      items: [],
    },
    tasks: [],
    reviewFindings: [],
    configValidation: DEFAULT_CONFIG_VALIDATION,
    mcpServers: [],
  };

  return {
    ...baseState,
    ...overrides,
    chat: {
      ...baseState.chat,
      ...overrides.chat,
    },
    approvals: {
      ...baseState.approvals,
      ...overrides.approvals,
    },
    configValidation: overrides.configValidation ?? baseState.configValidation,
    reviewFindings: overrides.reviewFindings ?? baseState.reviewFindings,
    tasks: overrides.tasks ?? baseState.tasks,
    mcpServers: overrides.mcpServers ?? baseState.mcpServers,
  };
}

export function selectStatusSummary(state: ShellState): StatusSummary {
  const taskCounts = countTasksByStatus(state.tasks);
  const usage = state.runtime?.usage;

  return {
    sessionTitle: state.currentSession?.title || "New session",
    sessionId: state.currentSession?.id,
    sessionStatus: state.currentSession?.status,
    mode: state.currentSession?.mode,
    workspacePath: state.currentSession?.workspacePath ?? "",
    modelName: state.runtime?.modelName ?? "n/a",
    messageCount: state.chat.messages.length,
    turnCount: state.currentSession?.turnCount ?? 0,
    runningToolCount: state.chat.tools.filter((tool) => tool.status === "running").length,
    pendingApprovalCount: state.approvals.items.filter((approval) => approval.status === "pending")
      .length,
    resolvedApprovalCount: state.approvals.items.filter((approval) => approval.status !== "pending")
      .length,
    reviewFindingCount: state.reviewFindings.length,
    lastResumeSessionId: state.resume?.sessionId,
    taskCounts,
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    llmCalls: usage?.calls ?? 0,
    currency: state.runtime?.cost?.currency ?? "¥",
    totalCost: state.runtime?.cost?.totalCost,
    healthyMcpServerCount: state.mcpServers.filter((server) => server.status === "healthy").length,
    totalMcpServerCount: state.mcpServers.length,
    configStatus: state.configValidation.status,
    configIssueCount: state.configValidation.issues.length,
  };
}

export function selectStatusBarSummary(state: ShellState): StatusBarSummary {
  return {
    activeScene: state.activeScene,
    mode: state.currentSession?.mode,
    sessionStatus: state.currentSession?.status,
    workspacePath: state.currentSession?.workspacePath ?? "",
    modelName: state.runtime?.modelName ?? "n/a",
    pendingApprovalCount: state.approvals.items.filter((approval) => approval.status === "pending")
      .length,
    activeTaskCount: state.tasks.filter((task) => isActiveTask(task)).length,
    totalTokens: state.runtime?.usage.totalTokens ?? 0,
    currency: state.runtime?.cost?.currency ?? "¥",
    totalCost: state.runtime?.cost?.totalCost,
    lastEventAt: state.lastEventAt,
  };
}

function compareTasksByRecency(left: ShellTaskEntry, right: ShellTaskEntry): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function countTasksByStatus(tasks: ShellTaskEntry[]): Record<InteractionTaskStatus, number> {
  const counts: Record<InteractionTaskStatus, number> = {
    pending: 0,
    running: 0,
    awaiting_approval: 0,
    completed: 0,
    failed: 0,
  };

  for (const task of tasks) {
    counts[task.status] += 1;
  }

  return counts;
}

export function selectTaskBoardSummary(state: ShellState): TaskBoardSummary {
  const active = state.tasks.filter((task) => isActiveTask(task)).sort(compareTasksByRecency);
  const queued = state.tasks
    .filter((task) => task.status === "pending")
    .sort(compareTasksByRecency);
  const finished = state.tasks
    .filter((task) => task.status === "completed" || task.status === "failed")
    .sort(compareTasksByRecency);

  return {
    sessionTitle: state.currentSession?.title ?? "No active session",
    sessionStatus: state.currentSession?.status,
    active,
    queued,
    finished,
    counts: countTasksByStatus(state.tasks),
    activeCount: active.length,
    queuedCount: queued.length,
    finishedCount: finished.length,
    focusedTaskId: active[0]?.id ?? queued[0]?.id ?? finished[0]?.id,
  };
}
