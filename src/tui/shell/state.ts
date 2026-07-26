import type {
  ApprovalRequest,
  ApprovalResolution,
  ConfigValidationSnapshot,
  InteractionTaskSnapshot,
  InteractionTaskStatus,
  MCPHealthSnapshot,
  ReviewFinding,
} from "../../interaction/events.js";
import type { LLMMessage } from "../../types/provider.js";
import type { SessionStatus, SessionSummary } from "../../types/session.js";
import type { ToolCall, ToolResult } from "../../types/tool.js";
import type { TUIScene } from "../types.js";

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
  reviewFindings: ReviewFinding[];
  configValidation: ConfigValidationSnapshot;
  mcpServers: MCPHealthSnapshot[];
  lastEventAt?: string;
}

export interface HomeSummary {
  activeScene: TUIScene;
  sessionTitle: string;
  sessionStatus?: SessionStatus;
  messageCount: number;
  runningToolCount: number;
  pendingApprovalCount: number;
  resolvedApprovalCount: number;
  reviewFindingCount: number;
  lastResumeSessionId?: string;
  taskCounts: Record<InteractionTaskStatus, number>;
}

const DEFAULT_CONFIG_VALIDATION: ConfigValidationSnapshot = {
  status: "idle",
  issues: [],
};

export function createInitialShellState(overrides: Partial<ShellState> = {}): ShellState {
  const baseState: ShellState = {
    activeScene: "home",
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

export function selectHomeSummary(state: ShellState): HomeSummary {
  const taskCounts: Record<InteractionTaskStatus, number> = {
    pending: 0,
    running: 0,
    awaiting_approval: 0,
    completed: 0,
    failed: 0,
  };

  for (const task of state.tasks) {
    taskCounts[task.status] += 1;
  }

  return {
    activeScene: state.activeScene,
    sessionTitle: state.currentSession?.title ?? "No active session",
    sessionStatus: state.currentSession?.status,
    messageCount: state.chat.messages.length,
    runningToolCount: state.chat.tools.filter((tool) => tool.status === "running").length,
    pendingApprovalCount: state.approvals.items.filter((approval) => approval.status === "pending")
      .length,
    resolvedApprovalCount: state.approvals.items.filter((approval) => approval.status !== "pending")
      .length,
    reviewFindingCount: state.reviewFindings.length,
    lastResumeSessionId: state.resume?.sessionId,
    taskCounts,
  };
}
