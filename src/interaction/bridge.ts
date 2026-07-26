import type { LLMMessage } from "../types/provider.js";
import type { SessionSummary } from "../types/session.js";
import type { ToolCall, ToolResult } from "../types/tool.js";
import type { InteractionEventEmitter } from "./emitter.js";
import type {
  ApprovalRequest,
  ApprovalResolution,
  ConfigValidationSnapshot,
  InteractionTaskSnapshot,
  MCPHealthSnapshot,
  ReviewFinding,
} from "./events.js";
import { createInteractionEvent } from "./events.js";

type InteractionEventSink = Pick<InteractionEventEmitter, "emit">;

export class InteractionEventBridge {
  constructor(
    private readonly sink: InteractionEventSink,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  messageAdded(message: LLMMessage) {
    return this.sink.emit(
      createInteractionEvent(
        "message.added",
        {
          message,
        },
        this.now(),
      ),
    );
  }

  toolStarted(toolCall: ToolCall, requiresApproval: boolean) {
    return this.sink.emit(
      createInteractionEvent(
        "tool.started",
        {
          toolCall,
          requiresApproval,
        },
        this.now(),
      ),
    );
  }

  toolFinished(toolCall: ToolCall, result: ToolResult) {
    return this.sink.emit(
      createInteractionEvent(
        "tool.finished",
        {
          toolCall,
          result,
        },
        this.now(),
      ),
    );
  }

  approvalRequested(request: ApprovalRequest) {
    return this.sink.emit(
      createInteractionEvent(
        "approval.requested",
        {
          request,
        },
        this.now(),
      ),
    );
  }

  approvalResolved(requestId: string, resolution: ApprovalResolution, reason?: string) {
    return this.sink.emit(
      createInteractionEvent(
        "approval.resolved",
        {
          requestId,
          resolution,
          reason,
        },
        this.now(),
      ),
    );
  }

  taskUpdated(task: InteractionTaskSnapshot) {
    return this.sink.emit(
      createInteractionEvent(
        "task.updated",
        {
          task,
        },
        this.now(),
      ),
    );
  }

  sessionChanged(summary: SessionSummary) {
    return this.sink.emit(
      createInteractionEvent(
        "session.changed",
        {
          summary,
        },
        this.now(),
      ),
    );
  }

  resumeLoaded(
    sessionId: string,
    options: {
      resumedFromInterrupted: boolean;
      forkedFromSessionId?: string;
    },
  ) {
    return this.sink.emit(
      createInteractionEvent(
        "resume.loaded",
        {
          sessionId,
          ...options,
        },
        this.now(),
      ),
    );
  }

  reviewFindingsReady(findings: ReviewFinding[]) {
    return this.sink.emit(
      createInteractionEvent(
        "review.findings.ready",
        {
          findings,
        },
        this.now(),
      ),
    );
  }

  configValidationUpdated(validation: ConfigValidationSnapshot) {
    return this.sink.emit(
      createInteractionEvent(
        "config.validation.updated",
        {
          validation,
        },
        this.now(),
      ),
    );
  }

  mcpHealthUpdated(servers: MCPHealthSnapshot[]) {
    return this.sink.emit(
      createInteractionEvent(
        "mcp.health.updated",
        {
          servers,
        },
        this.now(),
      ),
    );
  }
}
