import { describe, expect, it } from "vitest";
import { InteractionEventEmitter } from "../../../../src/interaction/emitter.js";
import { createInteractionEvent } from "../../../../src/interaction/events.js";
import { replayInteractionEvents } from "../../../../src/interaction/renderer-contract.js";
import { createShellStore } from "../../../../src/tui/shell/store.js";

describe("createShellStore", () => {
  it("subscribes to the interaction emitter and notifies listeners with updated state", () => {
    const emitter = new InteractionEventEmitter();
    const store = createShellStore({
      emitter,
    });
    const snapshots: Array<{ messages: number; approvals: number }> = [];

    const unsubscribe = store.subscribe((state) => {
      snapshots.push({
        messages: state.chat.messages.length,
        approvals: state.approvals.items.length,
      });
    });

    emitter.emit(
      createInteractionEvent("message.added", {
        message: {
          role: "assistant",
          content: "Working through the reducer",
        },
      }),
    );
    emitter.emit(
      createInteractionEvent("approval.requested", {
        request: {
          id: "approval-1",
          toolCall: {
            id: "tool-1",
            name: "write_file",
            args: {},
          },
          title: "Approve write",
          summary: "Write reducer implementation",
          risk: "medium",
        },
      }),
    );

    unsubscribe();
    store.dispose();

    emitter.emit(
      createInteractionEvent("message.added", {
        message: {
          role: "assistant",
          content: "This should not reach the disposed store",
        },
      }),
    );

    expect(store.getState().chat.messages).toHaveLength(1);
    expect(store.getState().approvals.items).toHaveLength(1);
    expect(snapshots).toEqual([
      { messages: 1, approvals: 0 },
      { messages: 1, approvals: 1 },
    ]);
  });

  it("replays interaction events and supports scene navigation", async () => {
    const store = createShellStore();

    await replayInteractionEvents(
      [
        createInteractionEvent("message.added", {
          message: {
            role: "user",
            content: "Render the chat scene",
          },
        }),
        createInteractionEvent("tool.started", {
          toolCall: {
            id: "tool-1",
            name: "shell_command",
            args: {
              command: "pnpm test",
            },
          },
          requiresApproval: false,
        }),
      ],
      store,
    );

    store.navigate("chat");

    expect(store.getState().activeScene).toBe("chat");
    expect(store.getState().chat.messages).toEqual([
      expect.objectContaining({
        text: "Render the chat scene",
      }),
    ]);
    expect(store.getState().chat.tools).toEqual([
      expect.objectContaining({
        id: "tool-1",
        status: "running",
      }),
    ]);
  });
});
