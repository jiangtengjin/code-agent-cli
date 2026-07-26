import { Box, Text } from "ink";
import type { TerminalCapabilities } from "../types.js";
import type { StatusBarSummary } from "../shell/state.js";

export interface StatusBarProps {
  summary: StatusBarSummary;
  capabilities: TerminalCapabilities;
}

export function StatusBar({ summary, capabilities }: StatusBarProps) {
  return (
    <Box flexDirection="column">
      <Text>Status | scene: {summary.activeScene} | mode: {summary.mode ?? "normal"} | session: {summary.sessionStatus ?? "idle"}</Text>
      <Text dimColor>
        workspace: {summary.workspacePath || "n/a"} | approvals: {summary.pendingApprovalCount} | tasks:{" "}
        {summary.activeTaskCount} | terminal: {capabilities.level}
      </Text>
    </Box>
  );
}
