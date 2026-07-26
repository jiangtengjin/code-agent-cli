import { Box, Text } from "ink";
import type { InspectorSummary } from "../shell/state.js";

export interface InspectorProps {
  summary: InspectorSummary;
}

export function Inspector({ summary }: InspectorProps) {
  return (
    <Box width={32} flexShrink={0} flexDirection="column">
      <Text>Inspector</Text>
      <Text>session: {summary.sessionTitle}</Text>
      <Text dimColor>id: {summary.sessionId ?? "n/a"}</Text>
      <Text dimColor>latest user: {summary.latestUserPreview ?? "n/a"}</Text>
      <Text dimColor>latest assistant: {summary.latestAssistantPreview ?? "n/a"}</Text>
      <Text>latest tool: {summary.latestToolName ?? "n/a"}</Text>
      <Text dimColor>tool status: {summary.latestToolStatus ?? "n/a"}</Text>
      <Text>resume: {summary.lastResumeSessionId ?? "none"}</Text>
      <Text>review findings: {summary.reviewFindingCount}</Text>
      <Text>
        config: {summary.configStatus} ({summary.configIssueCount}){summary.configDirty ? " *" : ""}
      </Text>
      <Text>
        mcp: {summary.healthyMcpServerCount}/{summary.totalMcpServerCount} healthy
      </Text>
    </Box>
  );
}
