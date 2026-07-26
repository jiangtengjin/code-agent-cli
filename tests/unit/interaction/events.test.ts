import { describe, expect, it } from "vitest";
import { createInteractionEvent } from "../../../src/interaction/events.js";

describe("createInteractionEvent", () => {
  it("creates typed message events with a stable timestamp", () => {
    const event = createInteractionEvent(
      "message.added",
      {
        message: {
          role: "assistant",
          content: "hello",
        },
      },
      "2026-07-26T12:00:00.000Z",
    );

    expect(event).toEqual({
      type: "message.added",
      createdAt: "2026-07-26T12:00:00.000Z",
      message: {
        role: "assistant",
        content: "hello",
      },
    });
  });

  it("creates approval events without widening the payload shape", () => {
    const event = createInteractionEvent("approval.requested", {
      request: {
        id: "approval-1",
        title: "Run terminal command",
        summary: "Execute a potentially destructive command",
        risk: "high",
        toolCall: {
          id: "tool-1",
          name: "run_terminal",
          args: {
            command: "rm -rf build",
          },
        },
      },
    });

    expect(event.type).toBe("approval.requested");
    expect(event.request.risk).toBe("high");
    expect(event.request.toolCall.name).toBe("run_terminal");
  });
});
