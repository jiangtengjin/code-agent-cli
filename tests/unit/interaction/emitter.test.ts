import { describe, expect, it } from "vitest";
import { InteractionEventEmitter } from "../../../src/interaction/emitter.js";
import { createInteractionEvent } from "../../../src/interaction/events.js";

describe("InteractionEventEmitter", () => {
  it("emits events to generic listeners in registration order", () => {
    const emitter = new InteractionEventEmitter();
    const order: string[] = [];

    emitter.on(() => {
      order.push("first");
    });
    emitter.on(() => {
      order.push("second");
    });

    emitter.emit(
      createInteractionEvent("message.added", {
        message: {
          role: "user",
          content: "inspect the auth bug",
        },
      }),
    );

    expect(order).toEqual(["first", "second"]);
  });

  it("filters listeners by event type and supports unsubscribe", () => {
    const emitter = new InteractionEventEmitter();
    const seen: string[] = [];

    const unsubscribe = emitter.onType("tool.finished", (event) => {
      seen.push(event.toolCall.name);
    });

    emitter.emit(
      createInteractionEvent("tool.started", {
        toolCall: {
          id: "tool-1",
          name: "read_file",
          args: {},
        },
        requiresApproval: false,
      }),
    );
    emitter.emit(
      createInteractionEvent("tool.finished", {
        toolCall: {
          id: "tool-1",
          name: "read_file",
          args: {},
        },
        result: {
          success: true,
          data: "ok",
        },
      }),
    );
    unsubscribe();
    emitter.emit(
      createInteractionEvent("tool.finished", {
        toolCall: {
          id: "tool-2",
          name: "write_file",
          args: {},
        },
        result: {
          success: true,
        },
      }),
    );

    expect(seen).toEqual(["read_file"]);
  });
});
