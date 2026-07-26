import type { ChatMode } from "../types/mode.js";
import type { Config } from "../types/config.js";
import type { LLMMessage } from "../types/provider.js";
import type { SessionSummary } from "../types/session.js";
import type { ToolCall, ToolResult } from "../types/tool.js";

export type ApprovalRiskLevel = "low" | "medium" | "high";
export type ApprovalResolution = "approved" | "approved_once" | "approved_similar" | "rejected";

export interface ApprovalRequest {
  id: string;
  toolCall: ToolCall;
  title: string;
  summary: string;
  risk: ApprovalRiskLevel;
  workingDirectory?: string;
  diff?: string;
}

export type InteractionTaskStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed";

export interface InteractionTaskSnapshot {
  id: string;
  title: string;
  status: InteractionTaskStatus;
  mode?: ChatMode;
  detail?: string;
}

export interface ReviewFinding {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
  filePath?: string;
  line?: number;
}

export interface ResumeCatalogItem {
  id: string;
  title: string;
  mode: ChatMode;
  status: SessionSummary["status"];
  updatedAt: string;
  workspacePath: string;
}

export interface ResumeCatalogSnapshot {
  items: ResumeCatalogItem[];
}

export type ConfigValidationStatus = "idle" | "validating" | "valid" | "invalid";

export interface ConfigValidationIssue {
  path: string;
  message: string;
  severity: "warning" | "error";
}

export interface ConfigValidationSnapshot {
  status: ConfigValidationStatus;
  issues: ConfigValidationIssue[];
}

export interface ConfigSnapshot {
  filePath: string;
  config: Config;
  dirty: boolean;
  diff?: string;
  updatedAt: string;
}

export type MCPHealthStatus = "starting" | "healthy" | "degraded" | "stopped" | "failed";

export interface MCPHealthSnapshot {
  serverName: string;
  status: MCPHealthStatus;
  toolCount: number;
  message?: string;
}

export type InteractionEvent =
  | {
      type: "message.added";
      createdAt: string;
      message: LLMMessage;
    }
  | {
      type: "tool.started";
      createdAt: string;
      toolCall: ToolCall;
      requiresApproval: boolean;
    }
  | {
      type: "tool.finished";
      createdAt: string;
      toolCall: ToolCall;
      result: ToolResult;
    }
  | {
      type: "approval.requested";
      createdAt: string;
      request: ApprovalRequest;
    }
  | {
      type: "approval.resolved";
      createdAt: string;
      requestId: string;
      resolution: ApprovalResolution;
      reason?: string;
    }
  | {
      type: "task.updated";
      createdAt: string;
      task: InteractionTaskSnapshot;
    }
  | {
      type: "session.changed";
      createdAt: string;
      summary: SessionSummary;
    }
  | {
      type: "resume.loaded";
      createdAt: string;
      sessionId: string;
      resumedFromInterrupted: boolean;
      forkedFromSessionId?: string;
    }
  | {
      type: "resume.catalog.updated";
      createdAt: string;
      catalog: ResumeCatalogSnapshot;
    }
  | {
      type: "review.findings.ready";
      createdAt: string;
      findings: ReviewFinding[];
    }
  | {
      type: "config.snapshot.updated";
      createdAt: string;
      snapshot: ConfigSnapshot;
    }
  | {
      type: "config.validation.updated";
      createdAt: string;
      validation: ConfigValidationSnapshot;
    }
  | {
      type: "mcp.health.updated";
      createdAt: string;
      servers: MCPHealthSnapshot[];
    };

export type InteractionEventType = InteractionEvent["type"];

export type InteractionEventOfType<TType extends InteractionEventType> = Extract<
  InteractionEvent,
  { type: TType }
>;

export function createInteractionEvent<TType extends InteractionEventType>(
  type: TType,
  payload: Omit<InteractionEventOfType<TType>, "type" | "createdAt">,
  createdAt = new Date().toISOString(),
): InteractionEventOfType<TType> {
  return {
    type,
    createdAt,
    ...payload,
  } as InteractionEventOfType<TType>;
}
