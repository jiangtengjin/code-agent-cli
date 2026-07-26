import { Box, Text } from "ink";
import type { TUIScene } from "../types.js";

export interface ComposerProps {
  activeScene: TUIScene;
  draft: string;
  note?: string;
}

export function Composer({ activeScene, draft, note }: ComposerProps) {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text>Composer</Text>
      {draft ? (
        <Text>draft: {draft}</Text>
      ) : (
        <Text dimColor>Type a task or /goto &lt;scene&gt; | current: {activeScene}</Text>
      )}
      {note ? <Text dimColor>{note}</Text> : null}
    </Box>
  );
}
