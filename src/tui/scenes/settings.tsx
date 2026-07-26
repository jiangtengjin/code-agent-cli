import { Box, Text } from "ink";
import type { ShellConfigSnapshotState } from "../shell/state.js";
import type { ConfigValidationSnapshot } from "../../interaction/events.js";

export interface SettingsSceneProps {
  snapshot?: ShellConfigSnapshotState;
  validation: ConfigValidationSnapshot;
}

function getModelSummary(snapshot: ShellConfigSnapshotState | undefined): string {
  const provider = snapshot?.config.model?.provider ?? "n/a";
  const model = snapshot?.config.model?.model ?? "n/a";
  return `${provider}/${model}`;
}

function getDiffPreview(snapshot: ShellConfigSnapshotState | undefined): string[] {
  if (!snapshot?.diff) {
    return [];
  }

  return snapshot.diff.split("\n").slice(0, 4);
}

export function SettingsScene({ snapshot, validation }: SettingsSceneProps) {
  const diffPreview = getDiffPreview(snapshot);

  return (
    <Box flexDirection="column">
      <Text>Settings</Text>
      <Text dimColor>file: {snapshot?.filePath ?? "n/a"}</Text>
      <Text dimColor>dirty: {snapshot?.dirty ? "yes" : "no"}</Text>
      <Text dimColor>validation: {validation.status}</Text>
      <Text dimColor>model: {getModelSummary(snapshot)}</Text>
      {validation.issues.length === 0 ? (
        <Text dimColor>No validation issues</Text>
      ) : (
        validation.issues.map((issue) => (
          <Text key={`${issue.path}:${issue.message}`} dimColor>
            {issue.path}: {issue.message}
          </Text>
        ))
      )}
      {diffPreview.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>Diff preview</Text>
          {diffPreview.map((line) => (
            <Text key={line} dimColor>
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
