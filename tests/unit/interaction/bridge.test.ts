import { describe, expect, it, vi } from "vitest";
import { InteractionEventBridge } from "../../../src/interaction/bridge.js";

describe("InteractionEventBridge", () => {
  it("emits semantically named tool lifecycle events", () => {
    const emit = vi.fn((event) => event);
    const bridge = new InteractionEventBridge({ emit }, () => "2026-07-26T12:34:56.000Z");
    const toolCall = {
      id: "tool-1",
      name: "read_file",
      args: {
        path: "src/index.ts",
      },
    };

    bridge.toolStarted(toolCall, false);
    bridge.toolFinished(toolCall, {
      success: true,
      data: "file content",
    });

    expect(emit).toHaveBeenNthCalledWith(1, {
      type: "tool.started",
      createdAt: "2026-07-26T12:34:56.000Z",
      toolCall,
      requiresApproval: false,
    });
    expect(emit).toHaveBeenNthCalledWith(2, {
      type: "tool.finished",
      createdAt: "2026-07-26T12:34:56.000Z",
      toolCall,
      result: {
        success: true,
        data: "file content",
      },
    });
  });

  it("captures approval and resume flows without exposing raw event construction", () => {
    const emit = vi.fn((event) => event);
    const bridge = new InteractionEventBridge({ emit }, () => "2026-07-26T12:35:00.000Z");

    bridge.approvalRequested({
      id: "approval-1",
      title: "Apply patch",
      summary: "Modify a tracked file",
      risk: "medium",
      toolCall: {
        id: "tool-2",
        name: "apply_patch",
        args: {
          path: "src/cli/chat.ts",
        },
      },
    });
    bridge.resumeLoaded("session-1", {
      resumedFromInterrupted: true,
      forkedFromSessionId: "session-0",
    });

    expect(emit).toHaveBeenNthCalledWith(1, {
      type: "approval.requested",
      createdAt: "2026-07-26T12:35:00.000Z",
      request: expect.objectContaining({
        id: "approval-1",
        risk: "medium",
      }),
    });
    expect(emit).toHaveBeenNthCalledWith(2, {
      type: "resume.loaded",
      createdAt: "2026-07-26T12:35:00.000Z",
      sessionId: "session-1",
      resumedFromInterrupted: true,
      forkedFromSessionId: "session-0",
    });
  });

  it("omits agent scope fields for the main agent", () => {
    const emit = vi.fn((event) => event);
    const bridge = new InteractionEventBridge({ emit }, () => "2026-08-27T10:00:00.000Z");

    bridge.messageAdded({ role: "user", content: "hi" });

    expect(emit.mock.calls[0][0]).not.toHaveProperty("agentId");
  });

  it("stamps agent scope on every event emitted through a derived bridge", () => {
    const emit = vi.fn((event) => event);
    const bridge = new InteractionEventBridge(
      { emit },
      () => "2026-08-27T10:00:00.000Z",
    ).forAgent({
      agentId: "agent-1",
      parentAgentId: "main",
      agentName: "code-explorer",
    });
    const toolCall = { id: "tool-1", name: "grep_search", args: { pattern: "x" } };

    bridge.messageAdded({ role: "assistant", content: "found" });
    bridge.toolStarted(toolCall, false);
    bridge.taskUpdated({ id: "agent-1", title: "search", status: "running" });

    for (const [event] of emit.mock.calls) {
      expect(event).toMatchObject({
        agentId: "agent-1",
        parentAgentId: "main",
        agentName: "code-explorer",
      });
    }
  });

  it("shares the sink with the parent bridge so a single emitter sees both", () => {
    const emit = vi.fn((event) => event);
    const parent = new InteractionEventBridge({ emit }, () => "2026-08-27T10:00:00.000Z");
    const child = parent.forAgent({ agentId: "agent-1" });

    parent.messageAdded({ role: "user", content: "parent" });
    child.messageAdded({ role: "assistant", content: "child" });

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0].agentId).toBeUndefined();
    expect(emit.mock.calls[1][0].agentId).toBe("agent-1");
  });
});
