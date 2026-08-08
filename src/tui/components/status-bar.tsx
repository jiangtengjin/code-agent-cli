import { Box, Text } from "ink";
import { SCENE_LABELS } from "../shell/router.js";
import type { StatusBarSummary } from "../shell/state.js";
import type { TerminalCapabilities } from "../types.js";

export interface StatusBarProps {
  summary: StatusBarSummary;
  capabilities: TerminalCapabilities;
}

/**
 * 把绝对路径压成尾段，长工作区路径不该挤占状态栏。
 */
function shortenPath(path: string): string {
  if (!path) {
    return "n/a";
  }

  const segments = path.split(/[\\/]/u).filter(Boolean);
  return segments.length <= 2 ? path : `…/${segments.slice(-2).join("/")}`;
}

function formatTokens(total: number): string {
  if (total < 1000) {
    return String(total);
  }

  return `${(total / 1000).toFixed(1)}k`;
}

export function StatusBar({ summary, capabilities }: StatusBarProps) {
  // 只有真正需要动作的计数才提示，0 值不占视觉重量。
  const alerts: string[] = [];
  if (summary.pendingApprovalCount > 0) {
    alerts.push(`approvals ${summary.pendingApprovalCount}`);
  }
  if (summary.activeTaskCount > 0) {
    alerts.push(`tasks ${summary.activeTaskCount}`);
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{SCENE_LABELS[summary.activeScene]}</Text>
        <Text dimColor>
          {"  "}
          {summary.mode ?? "normal"} · {summary.modelName} · {summary.sessionStatus ?? "idle"}
        </Text>
        {alerts.length > 0 ? <Text color="yellow">{`  ${alerts.join(" · ")}`}</Text> : null}
      </Box>
      <Text dimColor>
        {shortenPath(summary.workspacePath)} · {formatTokens(summary.totalTokens)} tok
        {summary.totalCost !== undefined
          ? ` · ${summary.currency}${summary.totalCost.toFixed(4)}`
          : ""}
        {capabilities.level === "full" ? "" : ` · ${capabilities.level}`}
      </Text>
    </Box>
  );
}
