import type {
  ApprovalRequest,
  ApprovalResolution,
  ConfigValidationStatus,
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
import { SCENE_LABELS, SHELL_SCENES } from "./router.js";

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

export interface StatusBarSummary {
  activeScene: TUIScene;
  mode?: SessionSummary["mode"];
  sessionStatus?: SessionStatus;
  workspacePath: string;
  pendingApprovalCount: number;
  runningTaskCount: number;
  lastEventAt?: string;
}

export interface RailItemSummary {
  scene: TUIScene;
  label: string;
  isActive: boolean;
  badge?: string;
}

export interface InspectorSummary {
  sessionTitle: string;
  sessionId?: string;
  latestUserPreview?: string;
  latestAssistantPreview?: string;
  latestToolName?: string;
  latestToolStatus?: ShellToolStatus;
  lastResumeSessionId?: string;
  reviewFindingCount: number;
  configStatus: ConfigValidationStatus;
  configIssueCount: number;
  healthyMcpServerCount: number;
  totalMcpServerCount: number;
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

export function selectStatusBarSummary(state: ShellState): StatusBarSummary {
  return {
    activeScene: state.activeScene,
    mode: state.currentSession?.mode,
    sessionStatus: state.currentSession?.status,
    workspacePath: state.currentSession?.workspacePath ?? "",
    pendingApprovalCount: state.approvals.items.filter((approval) => approval.status === "pending")
      .length,
    runningTaskCount: state.tasks.filter((task) => task.status === "running").length,
    lastEventAt: state.lastEventAt,
  };
}

export function selectRailItems(state: ShellState): RailItemSummary[] {
  const pendingApprovals = state.approvals.items.filter((approval) => approval.status === "pending")
    .length;
  const reviewFindings = state.reviewFindings.length;
  const configIssues = state.configValidation.issues.length;
  const taskCount = state.tasks.filter((task) => task.status === "running").length;
  const mcpServerCount = state.mcpServers.length;
  const hasResume = state.resume ? "1" : undefined;

  return SHELL_SCENES.map((scene) => {
    let badge: string | undefined;
    if (scene === "approvals" && pendingApprovals > 0) {
      badge = String(pendingApprovals);
    } else if (scene === "review" && reviewFindings > 0) {
      badge = String(reviewFindings);
    } else if (scene === "settings" && configIssues > 0) {
      badge = String(configIssues);
    } else if (scene === "tasks" && taskCount > 0) {
      badge = String(taskCount);
    } else if (scene === "mcp" && mcpServerCount > 0) {
      badge = String(mcpServerCount);
    } else if (scene === "resume" && hasResume) {
      badge = hasResume;
    }

    return {
      scene,
      label: SCENE_LABELS[scene],
      isActive: state.activeScene === scene,
      badge,
    };
  });
}

export function selectInspectorSummary(state: ShellState): InspectorSummary {
  const latestTool = state.chat.tools[state.chat.tools.length - 1];
  const healthyMcpServerCount = state.mcpServers.filter((server) => server.status === "healthy").length;

  return {
    sessionTitle: state.currentSession?.title ?? "No active session",
    sessionId: state.currentSession?.id,
    latestUserPreview: state.currentSession?.latestUserPreview,
    latestAssistantPreview: state.currentSession?.latestAssistantPreview,
    latestToolName: latestTool?.name,
    latestToolStatus: latestTool?.status,
    lastResumeSessionId: state.resume?.sessionId,
    reviewFindingCount: state.reviewFindings.length,
    configStatus: state.configValidation.status,
    configIssueCount: state.configValidation.issues.length,
    healthyMcpServerCount,
    totalMcpServerCount: state.mcpServers.length,
  };
}
