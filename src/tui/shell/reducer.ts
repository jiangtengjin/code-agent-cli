import type { InteractionEvent } from "../../interaction/events.js";
import type { LLMContentPart } from "../../types/provider.js";
import type { ShellAction } from "./actions.js";
import {
  type ShellApprovalEntry,
  type ShellMessageEntry,
  type ShellState,
  type ShellTaskEntry,
  type ShellToolEntry,
  createInitialShellState,
} from "./state.js";

function flattenMessageContent(content: string | LLMContentPart[] | null): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  return content
    .map((part) => {
      if (part.type === "text") {
        return part.text ?? "";
      }

      return "[image]";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function toMessageEntry(
  event: Extract<InteractionEvent, { type: "message.added" }>,
): ShellMessageEntry {
  return {
    id: `${event.createdAt}:${event.message.role}`,
    createdAt: event.createdAt,
    role: event.message.role,
    text: flattenMessageContent(event.message.content),
    message: event.message,
  };
}

function upsertTool(
  tools: ShellToolEntry[],
  event: Extract<InteractionEvent, { type: "tool.started" | "tool.finished" }>,
): ShellToolEntry[] {
  const index = tools.findIndex((tool) => tool.id === event.toolCall.id);
  const existing = index >= 0 ? tools[index] : undefined;
  const startedAt =
    existing?.startedAt ??
    (event.type === "tool.started" ? event.createdAt : (existing?.finishedAt ?? event.createdAt));
  const nextTool: ShellToolEntry =
    event.type === "tool.started"
      ? {
          id: event.toolCall.id,
          name: event.toolCall.name,
          toolCall: event.toolCall,
          requiresApproval: event.requiresApproval,
          status: existing?.finishedAt ? existing.status : "running",
          startedAt,
          finishedAt: existing?.finishedAt,
          result: existing?.result,
        }
      : {
          id: event.toolCall.id,
          name: event.toolCall.name,
          toolCall: event.toolCall,
          requiresApproval: existing?.requiresApproval ?? false,
          status: event.result.success ? "completed" : "failed",
          startedAt,
          finishedAt: event.createdAt,
          result: event.result,
        };

  if (index < 0) {
    return [...tools, nextTool];
  }

  return tools.map((tool, toolIndex) => (toolIndex === index ? nextTool : tool));
}

function upsertApproval(
  items: ShellApprovalEntry[],
  event:
    | Extract<InteractionEvent, { type: "approval.requested" }>
    | Extract<InteractionEvent, { type: "approval.resolved" }>,
): ShellApprovalEntry[] {
  const approvalId = event.type === "approval.requested" ? event.request.id : event.requestId;
  const index = items.findIndex((approval) => approval.id === approvalId);
  const existing = index >= 0 ? items[index] : undefined;
  const nextApproval: ShellApprovalEntry =
    event.type === "approval.requested"
      ? {
          id: event.request.id,
          title: event.request.title,
          summary: event.request.summary,
          status: existing?.status ?? "pending",
          risk: event.request.risk,
          requestedAt: existing?.requestedAt ?? event.createdAt,
          resolvedAt: existing?.resolvedAt,
          reason: existing?.reason,
          request: event.request,
        }
      : {
          id: approvalId,
          title: existing?.title ?? "Pending approval",
          summary: existing?.summary ?? "",
          status: event.resolution,
          risk: existing?.risk ?? "low",
          requestedAt: existing?.requestedAt ?? event.createdAt,
          resolvedAt: event.createdAt,
          reason: event.reason,
          request: existing?.request,
        };

  if (index < 0) {
    return [...items, nextApproval];
  }

  return items.map((approval, approvalIndex) =>
    approvalIndex === index ? nextApproval : approval,
  );
}

function upsertTask(
  tasks: ShellTaskEntry[],
  event: Extract<InteractionEvent, { type: "task.updated" }>,
): ShellTaskEntry[] {
  const nextTask: ShellTaskEntry = {
    ...event.task,
    updatedAt: event.createdAt,
  };
  const index = tasks.findIndex((task) => task.id === event.task.id);

  if (index < 0) {
    return [...tasks, nextTask];
  }

  return tasks.map((task, taskIndex) => (taskIndex === index ? nextTask : task));
}

function reduceInteractionEvent(state: ShellState, event: InteractionEvent): ShellState {
  switch (event.type) {
    case "message.added":
      return {
        ...state,
        chat: {
          ...state.chat,
          messages: [...state.chat.messages, toMessageEntry(event)],
        },
        lastEventAt: event.createdAt,
      };
    case "tool.started":
    case "tool.finished":
      return {
        ...state,
        chat: {
          ...state.chat,
          tools: upsertTool(state.chat.tools, event),
        },
        lastEventAt: event.createdAt,
      };
    case "approval.requested":
    case "approval.resolved":
      return {
        ...state,
        approvals: {
          items: upsertApproval(state.approvals.items, event),
        },
        lastEventAt: event.createdAt,
      };
    case "task.updated":
      return {
        ...state,
        tasks: upsertTask(state.tasks, event),
        lastEventAt: event.createdAt,
      };
    case "session.changed":
      if (state.currentSession?.id !== undefined && state.currentSession.id !== event.summary.id) {
        return {
          ...state,
          currentSession: event.summary,
          chat: {
            messages: [],
            tools: [],
          },
          approvals: {
            items: [],
          },
          tasks: [],
          lastEventAt: event.createdAt,
        };
      }

      return {
        ...state,
        currentSession: event.summary,
        lastEventAt: event.createdAt,
      };
    case "resume.loaded":
      return {
        ...state,
        resume: {
          sessionId: event.sessionId,
          resumedFromInterrupted: event.resumedFromInterrupted,
          forkedFromSessionId: event.forkedFromSessionId,
          loadedAt: event.createdAt,
        },
        lastEventAt: event.createdAt,
      };
    case "resume.catalog.updated":
      return {
        ...state,
        resumeCatalog: event.catalog,
        lastEventAt: event.createdAt,
      };
    case "review.findings.ready":
      return {
        ...state,
        reviewFindings: event.findings,
        lastEventAt: event.createdAt,
      };
    case "config.snapshot.updated":
      return {
        ...state,
        configSnapshot: event.snapshot,
        lastEventAt: event.createdAt,
      };
    case "config.validation.updated":
      return {
        ...state,
        configValidation: event.validation,
        lastEventAt: event.createdAt,
      };
    case "mcp.health.updated":
      return {
        ...state,
        mcpServers: event.servers,
        lastEventAt: event.createdAt,
      };
    case "runtime.usage.updated":
      return {
        ...state,
        runtime: event.runtime,
        lastEventAt: event.createdAt,
      };
  }

  return state;
}

export function reduceShellState(
  state: ShellState = createInitialShellState(),
  action: ShellAction,
): ShellState {
  if (action.type === "scene.changed") {
    if (state.activeScene === action.scene) {
      return state;
    }

    return {
      ...state,
      activeScene: action.scene,
    };
  }

  return reduceInteractionEvent(state, action.event);
}
