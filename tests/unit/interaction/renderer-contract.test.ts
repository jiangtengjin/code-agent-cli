import { describe, expect, it, vi } from "vitest";
import { createInteractionEvent } from "../../../src/interaction/events.js";
import { replayInteractionEvents } from "../../../src/interaction/renderer-contract.js";

describe("replayInteractionEvents", () => {
  it("replays events sequentially and flushes the renderer", async () => {
    const trace: string[] = [];
    const render = vi.fn(async (event: { type: string }) => {
      trace.push(event.type);
    });
    const flush = vi.fn(async () => {
      trace.push("flush");
    });

    await replayInteractionEvents(
      [
        createInteractionEvent("message.added", {
          message: {
            role: "assistant",
            content: "working",
          },
        }),
        createInteractionEvent("task.updated", {
          task: {
            id: "task-1",
            title: "Investigate failure",
            status: "running",
          },
        }),
      ],
      {
        render,
        flush,
      },
    );

    expect(render).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(trace).toEqual(["message.added", "task.updated", "flush"]);
  });
});
