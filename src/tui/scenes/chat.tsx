import { Box, Text } from "ink";
import type { ShellChatState, ShellMessageEntry, ShellToolEntry } from "../shell/state.js";

export interface ChatSceneProps {
  chat: ShellChatState;
  /** 待审批数量，用于在正文里只留摘要与跳转提示（审批本体在审批中心）。 */
  pendingApprovalCount?: number;
}

/** 正文保留的最近条目数，超出部分靠上方滚动历史，避免一次绘制过长。 */
const VISIBLE_ENTRY_COUNT = 12;

const ROLE_LABELS: Record<ShellMessageEntry["role"], string> = {
  user: "你",
  assistant: "agent",
  system: "system",
  tool: "tool",
};

const TOOL_STATUS_MARKS: Record<ShellToolEntry["status"], string> = {
  running: "◐",
  completed: "✓",
  failed: "✗",
};

const TOOL_STATUS_COLORS: Record<ShellToolEntry["status"], string | undefined> = {
  running: "cyan",
  completed: "green",
  failed: "red",
};

type TimelineEntry =
  | { kind: "message"; at: string; message: ShellMessageEntry }
  | { kind: "tool"; at: string; tool: ShellToolEntry };

/**
 * 把消息与工具调用合并成一条按时间排序的正文流。
 *
 * 之前二者分区展示，读者要在两个列表间来回对照才能还原「说了什么 -> 调了什么」，
 * 合并后阅读顺序就是发生顺序。
 */
export function buildTimeline(chat: ShellChatState): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...chat.messages.map(
      (message): TimelineEntry => ({ kind: "message", at: message.createdAt, message }),
    ),
    ...chat.tools.map((tool): TimelineEntry => ({ kind: "tool", at: tool.startedAt, tool })),
  ];

  return entries.sort((left, right) => left.at.localeCompare(right.at));
}

function formatToolArgs(tool: ShellToolEntry): string {
  const args = tool.toolCall.args;
  if (!args || Object.keys(args).length === 0) {
    return "";
  }

  // 只取首个参数做摘要，完整参数属于审批中心与任务详情的职责。
  const [key, value] = Object.entries(args)[0];
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  const trimmed = rendered.length > 48 ? `${rendered.slice(0, 47)}…` : rendered;
  return `${key}=${trimmed}`;
}

function renderMessage(message: ShellMessageEntry) {
  // 工具回传消息在时间线上由工具条目本身表达，避免同一件事出现两次。
  if (message.role === "tool" || message.role === "system") {
    return null;
  }

  return (
    <Box key={message.id} flexDirection="column" marginTop={1}>
      <Text color={message.role === "user" ? "cyan" : undefined} bold>
        {ROLE_LABELS[message.role]}
      </Text>
      <Text>{message.text || "(empty)"}</Text>
    </Box>
  );
}

function renderTool(tool: ShellToolEntry) {
  const argSummary = formatToolArgs(tool);
  const error = tool.status === "failed" ? tool.result?.error : undefined;

  return (
    <Box key={tool.id} flexDirection="column">
      <Box>
        <Text color={TOOL_STATUS_COLORS[tool.status]}>{`${TOOL_STATUS_MARKS[tool.status]} `}</Text>
        <Text dimColor>{tool.name}</Text>
        {argSummary ? <Text dimColor>{`  ${argSummary}`}</Text> : null}
        {tool.requiresApproval && tool.status === "running" ? (
          <Text color="yellow">{"  需审批"}</Text>
        ) : null}
      </Box>
      {error ? <Text color="red">{`  ${error}`}</Text> : null}
    </Box>
  );
}

/**
 * 首次进入时的引导。
 *
 * 用户上手慢的根因是不知道有哪些能力，所以空对话状态直接把
 * 「输 / 看命令」和 `/help` 摆在最显眼的位置。
 */
function renderEmptyState() {
  return (
    <Box flexDirection="column">
      <Text>直接描述你要做的事，我会读代码、改文件、跑命令。</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>上手：</Text>
        <Box>
          <Text color="cyan">{"  /help".padEnd(12)}</Text>
          <Text>看全部命令、模式说明与快捷键</Text>
        </Box>
        <Box>
          <Text color="cyan">{"  /status".padEnd(12)}</Text>
          <Text>看会话、用量与待办</Text>
        </Box>
        <Box>
          <Text color="cyan">{"  /mode".padEnd(12)}</Text>
          <Text>切换 normal / auto / plan / edit</Text>
        </Box>
        <Box>
          <Text color="cyan">{"  /resume".padEnd(12)}</Text>
          <Text>接着上次的会话继续</Text>
        </Box>
      </Box>
    </Box>
  );
}

export function ChatScene({ chat, pendingApprovalCount = 0 }: ChatSceneProps) {
  const timeline = buildTimeline(chat);
  const visible = timeline.slice(-VISIBLE_ENTRY_COUNT);
  const hiddenCount = timeline.length - visible.length;

  if (timeline.length === 0) {
    return renderEmptyState();
  }

  return (
    <Box flexDirection="column">
      {hiddenCount > 0 ? <Text dimColor>{`… 上方还有 ${hiddenCount} 条`}</Text> : null}
      {visible.map((entry) =>
        entry.kind === "message" ? renderMessage(entry.message) : renderTool(entry.tool),
      )}
      {pendingApprovalCount > 0 ? (
        <Box marginTop={1}>
          <Text color="yellow">{`${pendingApprovalCount} 项动作待审批 — /approvals 处理`}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
