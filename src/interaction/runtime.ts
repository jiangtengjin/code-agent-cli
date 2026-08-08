import type { LLMMessage, LLMToolCall } from "../types/provider.js";
import type { ToolCall } from "../types/tool.js";
import type { InteractionEventBridge } from "./bridge.js";

function createApprovalSummary(toolCall: LLMToolCall): string {
  try {
    return JSON.stringify(toolCall.args);
  } catch {
    return toolCall.name;
  }
}

export function toToolCall(toolCall: LLMToolCall): ToolCall {
  return {
    id: toolCall.id,
    name: toolCall.name,
    args: toolCall.args,
  };
}

export function createTrackedMessagesHandler(
  interaction: InteractionEventBridge,
  persist: (messages: LLMMessage[]) => Promise<void> | void,
  initialCount = 0,
): {
  handleMessagesChanged: (messages: LLMMessage[]) => Promise<void>;
  setTrackedCount: (count: number) => void;
} {
  let trackedCount = initialCount;

  return {
    async handleMessagesChanged(nextMessages: LLMMessage[]) {
      await persist(nextMessages);

      const startIndex = Math.min(trackedCount, nextMessages.length);
      for (const message of nextMessages.slice(startIndex)) {
        interaction.messageAdded(message);
      }
      trackedCount = nextMessages.length;
    },
    setTrackedCount(count: number) {
      trackedCount = Math.max(count, 0);
    },
  };
}

export function createConfirmToolCallWithInteraction(
  interaction: InteractionEventBridge,
  delegate: (toolCall: LLMToolCall) => Promise<boolean>,
): (toolCall: LLMToolCall) => Promise<boolean> {
  return async (toolCall: LLMToolCall) => {
    interaction.approvalRequested({
      id: toolCall.id,
      toolCall: toToolCall(toolCall),
      title: `Confirm ${toolCall.name}`,
      summary: createApprovalSummary(toolCall),
      risk: "high",
      workingDirectory: process.cwd(),
    });

    const approved = await delegate(toolCall);
    interaction.approvalResolved(toolCall.id, approved ? "approved_once" : "rejected");
    return approved;
  };
}
