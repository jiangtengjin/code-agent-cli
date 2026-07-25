import { randomUUID } from "node:crypto";
import type { CostTracker } from "../llm/cost-tracker.js";
import { createSessionState, deriveSessionTitle, forkSessionState } from "./runtime.js";
import { SessionStore } from "./store.js";
import type { UsageTracker } from "./usage.js";
import { resolveWorkspace } from "./workspace.js";
import type { SessionKind, SessionState, SessionStatus } from "../types/session.js";
import type { ChatMode } from "../types/mode.js";
import type { PlanState } from "../types/plan.js";
import type { LLMMessage } from "../types/provider.js";

type SessionPersistenceOptions = {
  enabled: boolean;
  storePath?: string;
  kind: SessionKind;
  cwd?: string;
  usageTracker: UsageTracker;
  costTracker: CostTracker;
  getMode: () => ChatMode;
  getMessages: () => LLMMessage[];
  getPendingPlan: () => PlanState | undefined;
};

function nowIso(): string {
  return new Date().toISOString();
}

export class SessionPersistence {
  private readonly enabled: boolean;
  private readonly store?: SessionStore;
  private readonly cwd: string;
  private workspace?:
    | {
        path: string;
        key: string;
      }
    | undefined;
  private session?: SessionState;
  private status: SessionStatus = "idle";
  private lastPersistedMessageCount = 0;
  private lastPersistedPlanState: string | null = null;
  private lastPersistedStatus: SessionStatus | undefined;

  constructor(private readonly options: SessionPersistenceOptions) {
    this.enabled = options.enabled && Boolean(options.storePath);
    this.store = this.enabled && options.storePath ? new SessionStore(options.storePath) : undefined;
    this.cwd = options.cwd ?? process.cwd();
  }

  async initialize(): Promise<void> {
    if (!this.enabled || !this.store) {
      return;
    }

    this.workspace = await resolveWorkspace(this.cwd);
  }

  hydrate(state: SessionState): void {
    this.workspace = {
      key: state.workspaceKey,
      path: state.workspacePath,
    };
    this.session = structuredClone(state);
    this.status = state.status;
    this.lastPersistedMessageCount = state.messages.length;
    this.lastPersistedPlanState = JSON.stringify(state.pendingPlan ?? null);
    this.lastPersistedStatus = state.status;
  }

  getCurrentState(): SessionState | undefined {
    if (!this.session) {
      return undefined;
    }

    const messages = [...this.options.getMessages()];
    const state: SessionState = {
      ...this.session,
      mode: this.options.getMode(),
      messages,
      pendingPlan: this.options.getPendingPlan(),
      usage: this.options.usageTracker.snapshot(),
      cost: this.options.costTracker.snapshot(),
      status: this.status,
    };
    state.title = deriveSessionTitle({ ...state, title: "" });
    return state;
  }

  async forkCurrentSession(title?: string): Promise<SessionState | undefined> {
    if (!this.store) {
      return undefined;
    }

    const currentState = this.getCurrentState();
    if (!currentState) {
      return undefined;
    }

    const forked = forkSessionState(currentState, {
      sessionId: randomUUID(),
      now: nowIso(),
      title,
    });

    await this.store.saveSession(forked);
    await this.store.appendEvent(forked.sessionId, {
      type: "fork",
      createdAt: nowIso(),
      parentSessionId: currentState.sessionId,
    });
    this.hydrate(forked);
    return forked;
  }

  async archiveCurrentSession(): Promise<SessionState | undefined> {
    if (!this.store || !this.session) {
      return undefined;
    }

    const archivedAt = nowIso();
    await this.store.setArchiveState(this.session.sessionId, true, archivedAt);
    await this.store.appendEvent(this.session.sessionId, {
      type: "archive",
      createdAt: archivedAt,
    });

    const archived = await this.store.loadSession(this.session.sessionId);
    this.clearActiveSession();
    return archived;
  }

  clearActiveSession(): void {
    this.session = undefined;
    this.status = "idle";
    this.lastPersistedMessageCount = 0;
    this.lastPersistedPlanState = null;
    this.lastPersistedStatus = undefined;
  }

  async updateStatus(status: SessionStatus, reason?: string): Promise<void> {
    this.status = status;

    if (!this.session || !this.store) {
      return;
    }

    if (this.lastPersistedStatus !== status) {
      await this.store.appendEvent(this.session.sessionId, {
        type: "status",
        createdAt: nowIso(),
        status,
        reason,
      });
      this.lastPersistedStatus = status;
    }

    await this.persistState();
  }

  async handleMessagesChanged(messages: LLMMessage[]): Promise<void> {
    if (!this.enabled || !this.store) {
      return;
    }

    if (messages.length === 0 && !this.session) {
      return;
    }

    if (messages.length > 0) {
      await this.ensureSession();
    }

    if (!this.session) {
      return;
    }

    if (messages.length < this.lastPersistedMessageCount) {
      this.lastPersistedMessageCount = 0;
    }

    for (const message of messages.slice(this.lastPersistedMessageCount)) {
      await this.store.appendEvent(this.session.sessionId, {
        type: "message",
        createdAt: nowIso(),
        message,
      });
    }

    this.lastPersistedMessageCount = messages.length;
    await this.persistState();
  }

  async handlePlanStateChanged(planState?: PlanState): Promise<void> {
    if (!this.enabled || !this.store) {
      return;
    }

    if (!this.session && !planState) {
      return;
    }

    if (planState) {
      await this.ensureSession();
    }

    if (!this.session) {
      return;
    }

    const serialized = JSON.stringify(planState ?? null);
    if (serialized !== this.lastPersistedPlanState) {
      await this.store.appendEvent(this.session.sessionId, {
        type: "plan",
        createdAt: nowIso(),
        planState: planState ?? null,
      });
      this.lastPersistedPlanState = serialized;
    }

    await this.persistState(planState);
  }

  async handleSessionUpdated(reason?: string): Promise<void> {
    if (!this.enabled || !this.store || !this.session) {
      return;
    }

    if (reason === "clear") {
      await this.store.appendEvent(this.session.sessionId, {
        type: "clear",
        createdAt: nowIso(),
      });
      this.lastPersistedMessageCount = 0;
      this.lastPersistedPlanState = null;
    }

    await this.persistState();
  }

  private async ensureSession(): Promise<void> {
    if (!this.enabled || !this.store || this.session) {
      return;
    }

    if (!this.workspace) {
      this.workspace = await resolveWorkspace(this.cwd);
    }

    this.session = createSessionState({
      sessionId: randomUUID(),
      kind: this.options.kind,
      mode: this.options.getMode(),
      workspaceKey: this.workspace.key,
      workspacePath: this.workspace.path,
      now: nowIso(),
    });
  }

  private async persistState(planOverride?: PlanState): Promise<void> {
    if (!this.store || !this.session) {
      return;
    }

    const now = nowIso();
    const messages = [...this.options.getMessages()];
    const state: SessionState = {
      ...this.session,
      mode: this.options.getMode(),
      messages,
      pendingPlan: planOverride ?? this.options.getPendingPlan(),
      usage: this.options.usageTracker.snapshot(),
      cost: this.options.costTracker.snapshot(),
      status: this.status,
      updatedAt: now,
      lastActiveAt: now,
    };
    state.title = deriveSessionTitle({ ...state, title: "" });

    await this.store.saveSession(state);
    this.session = state;
    this.lastPersistedStatus = state.status;
  }
}
