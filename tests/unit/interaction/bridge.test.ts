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
});
