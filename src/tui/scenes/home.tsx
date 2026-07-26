import { Box, Text } from "ink";

const PRIMARY_SCENES = [
  "home",
  "chat",
  "approvals",
  "resume",
  "review",
  "settings",
  "mcp",
  "tasks",
];

export function HomeScene() {
  return (
    <Box flexDirection="column">
      <Text>Home</Text>
      <Text dimColor>统一 Shell 总览入口已经建立，后续场景会逐步迁入。</Text>
      <Text>Scenes: {PRIMARY_SCENES.join(" | ")}</Text>
    </Box>
  );
}
