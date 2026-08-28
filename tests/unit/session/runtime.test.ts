import { describe, expect, it } from "vitest";
import {
  createSessionState,
  createSessionSummary,
  forkSessionState,
} from "../../../src/session/runtime.js";
import type { SessionState } from "../../../src/types/session.js";

function buildState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: "session-1",
    kind: "interactive",
    mode: "plan",
    messages: [
      { role: "user", content: "Investigate the failing auth timeout in production" },
      { role: "assistant", content: "I will inspect the timeout path and reproduce it locally." },
    ],
    pendingPlan: {
      originalTask: "Investigate auth timeout",
      summary: "Plan summary",
      steps: [{ title: "Step 1", prompt: "Inspect logs", status: "pending" }],
    },
    usage: {
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
      calls: 1,
    },
    cost: {
      currency: "¥",
      totalCost: 0.002,
      byModel: {},
    },
    status: "idle",
    workspaceKey: "workspace-1",
    workspacePath: "/repo",
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:01:00.000Z",
    lastActiveAt: "2026-07-25T12:01:00.000Z",
    title: "Investigate the failing auth timeout in production",
    ...overrides,
  };
}

describe("session runtime helpers", () => {
  it("creates a new empty interactive session state", () => {
    const state = createSessionState({
      sessionId: "session-new",
      kind: "interactive",
      mode: "normal",
      workspaceKey: "workspace-1",
      workspacePath: "/repo",
      now: "2026-07-25T12:00:00.000Z",
    });

    expect(state).toMatchObject({
      sessionId: "session-new",
      kind: "interactive",
      mode: "normal",
      status: "idle",
      workspaceKey: "workspace-1",
      workspacePath: "/repo",
      title: "New session",
    });
    expect(state.messages).toEqual([]);
    expect(state.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    });
  });

  it("derives summary fields from the current session state", () => {
    const state = buildState();

    expect(createSessionSummary(state)).toMatchObject({
      id: "session-1",
      kind: "interactive",
      mode: "plan",
      status: "idle",
      workspaceKey: "workspace-1",
      workspacePath: "/repo",
      turnCount: 1,
      latestUserPreview: "Investigate the failing auth timeout in production",
      latestAssistantPreview: "I will inspect the timeout path and reproduce it locally.",
    });
  });

  it("forks a session into a new idle branch with reset usage and copied context", () => {
    const parent = buildState();

    const forked = forkSessionState(parent, {
      sessionId: "session-2",
      now: "2026-07-25T12:05:00.000Z",
    });

    expect(forked).toMatchObject({
      sessionId: "session-2",
      parentSessionId: "session-1",
      status: "idle",
      mode: "plan",
      workspaceKey: "workspace-1",
      workspacePath: "/repo",
    });
    expect(forked.messages).toEqual(parent.messages);
    expect(forked.pendingPlan).toEqual(parent.pendingPlan);
    expect(forked.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    });
    expect(forked.cost).toEqual({
      currency: "¥",
      totalCost: 0,
      byModel: {},
    });
  });
});
