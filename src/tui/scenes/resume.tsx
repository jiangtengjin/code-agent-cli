import { Box, Text } from "ink";
import type { ShellResumeCatalogState, ShellResumeState } from "../shell/state.js";

export interface ResumeSceneProps {
  catalog?: ShellResumeCatalogState;
  resume?: ShellResumeState;
}

function renderCatalogItem(item: NonNullable<ResumeSceneProps["catalog"]>["items"][number]) {
  return (
    <Box key={item.id} flexDirection="column" marginTop={1}>
      <Text>
        {item.title} [{item.status}]
      </Text>
      <Text dimColor>
        id: {item.id} | mode: {item.mode} | updated: {item.updatedAt}
      </Text>
      <Text dimColor>workspace: {item.workspacePath}</Text>
    </Box>
  );
}

export function ResumeScene({ catalog, resume }: ResumeSceneProps) {
  const items = [...(catalog?.items ?? [])].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

  return (
    <Box flexDirection="column">
      <Text>Resume</Text>
      <Text dimColor>Catalog: {items.length} sessions</Text>
      <Text dimColor>Last resumed: {resume?.sessionId ?? "none"}</Text>
      {items.length === 0 ? (
        <Text dimColor>No saved sessions</Text>
      ) : (
        items.map((item) => renderCatalogItem(item))
      )}
    </Box>
  );
}
