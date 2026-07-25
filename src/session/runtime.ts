import type { CostSnapshot } from "../llm/cost-tracker.js";
import type { UsageSnapshot } from "./usage.js";
import type { SessionState, SessionSummary } from "../types/session.js";

type CreateSessionStateInput = {
  sessionId: string;
  kind: SessionState["kind"];
  mode: SessionState["mode"];
  workspaceKey: string;
  workspacePath: string;
  now?: string;
  title?: string;
  parentSessionId?: string;
};

type ForkSessionStateInput = {
  sessionId: string;
  now?: string;
  title?: string;
};

export const DEFAULT_SESSION_TITLE = "New session";

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptyUsage(): UsageSnapshot {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    calls: 0,
  };
}

function createEmptyCost(): CostSnapshot {
  return {
    currency: "¥",
    totalCost: 0,
    byModel: {},
  };
}

function getTextContent(content: SessionState["messages"][number]["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  return content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text ?? "")
    .join(" ");
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function limitText(text: string, maxLength: number): string {
  const normalized = compactText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getFirstUserMessage(state: SessionState): string {
  const firstUserMessage = state.messages.find((message) => message.role === "user");
  return firstUserMessage ? getTextContent(firstUserMessage.content) : "";
}

function getLatestMessagePreview(state: SessionState, role: "user" | "assistant"): string | undefined {
  const message = [...state.messages].reverse().find((item) => item.role === role);
  const text = message ? getTextContent(message.content) : "";
  return text ? limitText(text, 80) : undefined;
}

export function deriveSessionTitle(state: SessionState): string {
  if (state.title.trim()) {
    return state.title.trim();
  }

  const firstUserMessage = getFirstUserMessage(state);
  return firstUserMessage ? limitText(firstUserMessage, 60) : DEFAULT_SESSION_TITLE;
}

export function createSessionState(input: CreateSessionStateInput): SessionState {
  const now = input.now ?? nowIso();

  return {
    sessionId: input.sessionId,
    kind: input.kind,
    mode: input.mode,
    messages: [],
    usage: createEmptyUsage(),
    cost: createEmptyCost(),
    status: "idle",
    workspaceKey: input.workspaceKey,
    workspacePath: input.workspacePath,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    title: input.title?.trim() || DEFAULT_SESSION_TITLE,
    parentSessionId: input.parentSessionId,
  };
}

export function createSessionSummary(state: SessionState): SessionSummary {
  return {
    id: state.sessionId,
    kind: state.kind,
    title: deriveSessionTitle(state),
    workspaceKey: state.workspaceKey,
    workspacePath: state.workspacePath,
    status: state.status,
    mode: state.mode,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    lastActiveAt: state.lastActiveAt,
    turnCount: state.messages.filter((message) => message.role === "user").length,
    archivedAt: state.archivedAt,
    parentSessionId: state.parentSessionId,
    latestUserPreview: getLatestMessagePreview(state, "user"),
    latestAssistantPreview: getLatestMessagePreview(state, "assistant"),
  };
}

export function forkSessionState(
  parent: SessionState,
  input: ForkSessionStateInput,
): SessionState {
  const now = input.now ?? nowIso();

  return {
    sessionId: input.sessionId,
    kind: parent.kind,
    mode: parent.mode,
    messages: structuredClone(parent.messages),
    pendingPlan: parent.pendingPlan ? structuredClone(parent.pendingPlan) : undefined,
    usage: createEmptyUsage(),
    cost: createEmptyCost(),
    status: "idle",
    workspaceKey: parent.workspaceKey,
    workspacePath: parent.workspacePath,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    title: input.title?.trim() || deriveSessionTitle(parent),
    parentSessionId: parent.sessionId,
  };
}
