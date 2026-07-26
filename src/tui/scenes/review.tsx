import { Box, Text } from "ink";
import type { ReviewFinding } from "../../interaction/events.js";

export interface ReviewSceneProps {
  findings: ReviewFinding[];
}

const SEVERITY_PRIORITY: Record<ReviewFinding["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function sortFindings(left: ReviewFinding, right: ReviewFinding): number {
  const severityDelta = SEVERITY_PRIORITY[left.severity] - SEVERITY_PRIORITY[right.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  if (left.filePath !== right.filePath) {
    return (left.filePath ?? "").localeCompare(right.filePath ?? "");
  }

  return (left.line ?? 0) - (right.line ?? 0);
}

function renderFinding(finding: ReviewFinding) {
  return (
    <Box key={finding.id} flexDirection="column" marginTop={1}>
      <Text>
        {finding.title} [{finding.severity}]
      </Text>
      <Text dimColor>{finding.summary}</Text>
      {finding.filePath ? (
        <Text dimColor>
          file: {finding.filePath}
          {finding.line ? `:${finding.line}` : ""}
        </Text>
      ) : null}
    </Box>
  );
}

export function ReviewScene({ findings }: ReviewSceneProps) {
  const sortedFindings = [...findings].sort(sortFindings);

  return (
    <Box flexDirection="column">
      <Text>Review</Text>
      <Text dimColor>Findings: {sortedFindings.length}</Text>
      {sortedFindings.length === 0 ? (
        <Text dimColor>No review findings</Text>
      ) : (
        sortedFindings.map((finding) => renderFinding(finding))
      )}
    </Box>
  );
}
