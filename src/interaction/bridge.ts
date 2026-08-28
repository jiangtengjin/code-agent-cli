import type { LLMMessage } from "../types/provider.js";
import type { SessionSummary } from "../types/session.js";
import type { ToolCall, ToolResult } from "../types/tool.js";
import type { InteractionEventEmitter } from "./emitter.js";
import type {
  ApprovalRequest,
  ApprovalResolution,
  ConfigSnapshot,
  ConfigValidationSnapshot,
  InteractionAgentScope,
  InteractionTaskSnapshot,
  MCPHealthSnapshot,
  ResumeCatalogSnapshot,
  ReviewFinding,
  RuntimeUsageSnapshot,
} from "./events.js";
import { createInteractionEvent } from "./events.js";

type InteractionEventSink = Pick<InteractionEventEmitter, "emit">;

export class InteractionEventBridge {
  constructor(
    private readonly sink: InteractionEventSink,
    private readonly now: () => string = () => new Date().toISOString(),
    /**
     * 事件的 agent 归属。
     *
     * 主 agent 用默认的空 scope；子 agent 用 forAgent() 派生一个带自身 id 的
     * bridge，从而无需给 14 个方法逐个加参数。
     */
    private readonly scope: InteractionAgentScope = {},
  ) {}

  /** 派生一个把事件标记为指定子 agent 的 bridge，共享同一个 sink */
  forAgent(scope: InteractionAgentScope): InteractionEventBridge {
    return new InteractionEventBridge(this.sink, this.now, scope);
  }

  messageAdded(message: LLMMessage) {
    return this.sink.emit(
      createInteractionEvent(
        "message.added",
        {
          ...this.scope,
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
          ...this.scope,
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
          ...this.scope,
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
          ...this.scope,
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
          ...this.scope,
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
          ...this.scope,
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
          ...this.scope,
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
          ...this.scope,
          sessionId,
          ...options,
        },
        this.now(),
      ),
    );
  }

  resumeCatalogUpdated(catalog: ResumeCatalogSnapshot) {
    return this.sink.emit(
      createInteractionEvent(
        "resume.catalog.updated",
        {
          ...this.scope,
          catalog,
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
          ...this.scope,
          findings,
        },
        this.now(),
      ),
    );
  }

  configSnapshotUpdated(snapshot: ConfigSnapshot) {
    return this.sink.emit(
      createInteractionEvent(
        "config.snapshot.updated",
        {
          ...this.scope,
          snapshot,
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
          ...this.scope,
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
          ...this.scope,
          servers,
        },
        this.now(),
      ),
    );
  }

  runtimeUsageUpdated(runtime: RuntimeUsageSnapshot) {
    return this.sink.emit(
      createInteractionEvent(
        "runtime.usage.updated",
        {
          ...this.scope,
          runtime,
        },
        this.now(),
      ),
    );
  }
}
