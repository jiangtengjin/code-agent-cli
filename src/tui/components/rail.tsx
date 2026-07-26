import { Box, Text } from "ink";
import { SHELL_SHORTCUT_HINTS } from "../shell/shortcuts.js";
import type { RailItemSummary } from "../shell/state.js";

export interface RailProps {
  items: RailItemSummary[];
}

export function Rail({ items }: RailProps) {
  return (
    <Box width={20} flexShrink={0} flexDirection="column">
      <Text>Rail</Text>
      {items.map((item) => (
        <Text key={item.scene}>
          {item.isActive ? ">" : " "} {item.label}
          {item.badge ? ` [${item.badge}]` : ""}
        </Text>
      ))}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Shortcuts</Text>
        {SHELL_SHORTCUT_HINTS.map((hint) => (
          <Text key={hint} dimColor>
            {hint}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
