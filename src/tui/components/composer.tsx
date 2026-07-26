import { Box, Text } from "ink";
import type { TUIScene } from "../types.js";

export interface ComposerProps {
  activeScene: TUIScene;
}

export function Composer({ activeScene }: ComposerProps) {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text>Composer</Text>
      <Text dimColor>Type a task or /goto &lt;scene&gt; | current: {activeScene}</Text>
    </Box>
  );
}
