import { Box, Text } from "ink";
import { HomeScene } from "./scenes/home.js";
import { PlaceholderScene } from "./scenes/placeholder.js";
import type { TUIScene, TerminalCapabilities } from "./types.js";

export interface TUIAppProps {
  scene?: TUIScene;
  capabilities: TerminalCapabilities;
}

function renderScene(scene: TUIScene) {
  if (scene === "home") {
    return <HomeScene />;
  }

  return <PlaceholderScene scene={scene} />;
}

export function TUIApp({ scene = "home", capabilities }: TUIAppProps) {
  return (
    <Box flexDirection="column">
      <Text>Code Agent CLI</Text>
      <Text dimColor>Unified TUI foundation</Text>
      <Text>
        Current scene: {scene} | terminal: {capabilities.level}
      </Text>
      <Text dimColor>Reason: {capabilities.reason}</Text>
      <Box marginTop={1} flexDirection="column">
        {renderScene(scene)}
      </Box>
    </Box>
  );
}
