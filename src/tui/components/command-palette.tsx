import { Box, Text } from "ink";
import type { PaletteItem, PaletteState } from "../hooks/use-command-palette.js";

export interface CommandPaletteProps {
  state: PaletteState;
}

function renderEntry(item: PaletteItem, isSelected: boolean) {
  const marker = isSelected ? ">" : " ";
  const kind = item.kind === "scene" ? "scene" : "cmd";
  return (
    <Text key={item.id} dimColor={!isSelected}>
      {marker} {item.label} ({kind}){item.description ? ` ${item.description}` : ""}
    </Text>
  );
}

export function CommandPalette({ state }: CommandPaletteProps) {
  const items = state.items;

  return (
    <Box marginTop={1} flexDirection="column">
      <Text>Command Palette</Text>
      <Text dimColor>
        query: {state.query || "(type to filter)"} | up/down to move | enter to run | esc to close
      </Text>
      {items.length === 0 ? (
        <Text dimColor>No matches</Text>
      ) : (
        items.map((item, index) => renderEntry(item, index === state.selectedIndex))
      )}
    </Box>
  );
}
