import type { CostSnapshot } from "../llm/cost-tracker.js";
import type { UsageSnapshot } from "../session/usage.js";
import type { ChatMode } from "./mode.js";
import type { PlanState } from "./plan.js";
import type { LLMMessage } from "./provider.js";

export type SessionKind = "interactive" | "prompt";

export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_plan_approval"
  | "interrupted"
  | "archived";

export interface SessionSummary {
  id: string;
  kind: SessionKind;
  title: string;
  workspaceKey: string;
  workspacePath: string;
  status: SessionStatus;
  mode: ChatMode;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  turnCount: number;
  archivedAt?: string;
  parentSessionId?: string;
  latestUserPreview?: string;
  latestAssistantPreview?: string;
}

export interface SessionState {
  sessionId: string;
  kind: SessionKind;
  mode: ChatMode;
  messages: LLMMessage[];
  pendingPlan?: PlanState;
  usage: UsageSnapshot;
  cost?: CostSnapshot;
  status: SessionStatus;
  workspaceKey: string;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  title: string;
  archivedAt?: string;
  parentSessionId?: string;
}

export type SessionEvent =
  | { type: "message"; createdAt: string; message: LLMMessage }
  | { type: "status"; createdAt: string; status: SessionStatus; reason?: string }
  | { type: "plan"; createdAt: string; planState: PlanState | null }
  | { type: "fork"; createdAt: string; parentSessionId: string }
  | { type: "archive"; createdAt: string }
  | { type: "clear"; createdAt: string }
  | { type: "resume"; createdAt: string; fromSessionId?: string };
