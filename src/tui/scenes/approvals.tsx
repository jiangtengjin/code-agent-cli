import { Box, Text } from "ink";
import type { ShellApprovalEntry, ShellApprovalState } from "../shell/state.js";

export interface ApprovalsSceneProps {
  approvals: ShellApprovalState;
}

const RISK_PRIORITY: Record<ShellApprovalEntry["risk"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function sortApprovals(left: ShellApprovalEntry, right: ShellApprovalEntry): number {
  if (left.status !== right.status) {
    return left.status === "pending" ? -1 : 1;
  }

  const riskDelta = RISK_PRIORITY[left.risk] - RISK_PRIORITY[right.risk];
  if (riskDelta !== 0) {
    return riskDelta;
  }

  return right.requestedAt.localeCompare(left.requestedAt);
}

function renderApproval(approval: ShellApprovalEntry) {
  return (
    <Box key={approval.id} flexDirection="column" marginTop={1}>
      <Text>
        {approval.title} [{approval.status}]
      </Text>
      <Text dimColor>
        risk: {approval.risk} | requested: {approval.requestedAt}
      </Text>
      <Text dimColor>{approval.summary}</Text>
      {approval.request?.workingDirectory ? (
        <Text dimColor>cwd: {approval.request.workingDirectory}</Text>
      ) : null}
    </Box>
  );
}

export function ApprovalsScene({ approvals }: ApprovalsSceneProps) {
  const sortedItems = [...approvals.items].sort(sortApprovals);
  const pendingCount = sortedItems.filter((approval) => approval.status === "pending").length;
  const resolvedCount = sortedItems.length - pendingCount;

  return (
    <Box flexDirection="column">
      <Text>Approvals</Text>
      <Text dimColor>
        Pending: {pendingCount} | Resolved: {resolvedCount}
      </Text>
      {sortedItems.length === 0 ? (
        <Text dimColor>No approvals yet</Text>
      ) : (
        sortedItems.map((approval) => renderApproval(approval))
      )}
    </Box>
  );
}
