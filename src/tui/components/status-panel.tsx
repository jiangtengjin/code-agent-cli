import { Box, Text } from "ink";
import type { StatusSummary } from "../shell/state.js";

export interface StatusPanelProps {
  summary: StatusSummary;
}

function renderRow(label: string, value: string) {
  return (
    <Box key={label}>
      <Text dimColor>{`  ${label}`.padEnd(16)}</Text>
      <Text>{value}</Text>
    </Box>
  );
}

/**
 * `/status` 面板：原 home 场景的信息，改为对话之上的一次性总览。
 *
 * 用户不必离开对话就能看完会话、用量、待办三块，Esc 即回。
 */
export function StatusPanel({ summary }: StatusPanelProps) {
  const pendingWork = [
    summary.pendingApprovalCount > 0 ? `${summary.pendingApprovalCount} 待审批` : undefined,
    summary.taskCounts.running > 0 ? `${summary.taskCounts.running} 运行中` : undefined,
    summary.taskCounts.pending > 0 ? `${summary.taskCounts.pending} 排队` : undefined,
    summary.taskCounts.failed > 0 ? `${summary.taskCounts.failed} 失败` : undefined,
    summary.reviewFindingCount > 0 ? `${summary.reviewFindingCount} review 问题` : undefined,
  ].filter(Boolean);

  return (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Text bold>状态</Text>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>会话</Text>
        {renderRow("标题", summary.sessionTitle)}
        {renderRow("id", summary.sessionId ?? "未创建")}
        {renderRow("状态", summary.sessionStatus ?? "idle")}
        {renderRow("模式", summary.mode ?? "normal")}
        {renderRow("模型", summary.modelName)}
        {renderRow("工作区", summary.workspacePath || "n/a")}
        {renderRow("消息 / 轮次", `${summary.messageCount} / ${summary.turnCount}`)}
        {summary.lastResumeSessionId ? renderRow("已恢复自", summary.lastResumeSessionId) : null}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>用量</Text>
        {renderRow("prompt", String(summary.promptTokens))}
        {renderRow("completion", String(summary.completionTokens))}
        {renderRow("总计", `${summary.totalTokens} tok / ${summary.llmCalls} 次调用`)}
        {renderRow(
          "费用",
          summary.totalCost === undefined
            ? "未统计"
            : `${summary.currency}${summary.totalCost.toFixed(4)}`,
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>待办</Text>
        {pendingWork.length === 0 ? (
          <Text>{"  无待处理事项"}</Text>
        ) : (
          <Text color="yellow">{`  ${pendingWork.join(" · ")}`}</Text>
        )}
        {renderRow(
          "MCP",
          summary.totalMcpServerCount === 0
            ? "未配置"
            : `${summary.healthyMcpServerCount}/${summary.totalMcpServerCount} 健康`,
        )}
        {renderRow(
          "配置",
          summary.configIssueCount > 0
            ? `${summary.configStatus} (${summary.configIssueCount} 项问题)`
            : summary.configStatus,
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Esc 关闭</Text>
      </Box>
    </Box>
  );
}
