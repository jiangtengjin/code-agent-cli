import { Box, Text } from "ink";
import { SHELL_SCENES } from "../shell/router.js";
import type { HomeSummary } from "../shell/state.js";

export interface HomeSceneProps {
  summary: HomeSummary;
}

export function HomeScene({ summary }: HomeSceneProps) {
  return (
    <Box flexDirection="column">
      <Text>Home</Text>
      <Text>Session: {summary.sessionTitle}</Text>
      <Text dimColor>Status: {summary.sessionStatus ?? "idle"}</Text>
      <Text>Messages: {summary.messageCount}</Text>
      <Text>Running tools: {summary.runningToolCount}</Text>
      <Text>Pending approvals: {summary.pendingApprovalCount}</Text>
      <Text>Review findings: {summary.reviewFindingCount}</Text>
      <Text>
        Tasks: pending={summary.taskCounts.pending} running={summary.taskCounts.running} awaiting=
        {summary.taskCounts.awaiting_approval} completed={summary.taskCounts.completed} failed=
        {summary.taskCounts.failed}
      </Text>
      {summary.lastResumeSessionId ? (
        <Text>Last resume: {summary.lastResumeSessionId}</Text>
      ) : (
        <Text dimColor>No resumed session yet</Text>
      )}
      <Text>Scenes: {SHELL_SCENES.join(" | ")}</Text>
    </Box>
  );
}
