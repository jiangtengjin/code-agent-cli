import { Box, Text } from "ink";
import type { PaletteItem, PaletteState } from "../hooks/use-command-palette.js";

export interface CommandPaletteProps {
  state: PaletteState;
}

function renderEntry(item: PaletteItem, isSelected: boolean) {
  return (
    <Box key={item.id}>
      <Text color={isSelected ? "cyan" : undefined} dimColor={!isSelected}>
        {isSelected ? "❯ " : "  "}
        {item.label.padEnd(12)}
      </Text>
      <Text dimColor>
        {item.argHint ? `${item.argHint} ` : ""}
        {item.description ?? ""}
      </Text>
    </Box>
  );
}

export function CommandPalette({ state }: CommandPaletteProps) {
  const items = state.items;

  return (
    <Box marginTop={1} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Box>
        <Text color="cyan">{"❯ "}</Text>
        {state.query ? <Text>{state.query}</Text> : <Text dimColor>输入以筛选命令</Text>}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {items.length === 0 ? (
          <Text dimColor>无匹配命令</Text>
        ) : (
          items.map((item, index) => renderEntry(item, index === state.selectedIndex))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑ ↓ 移动 · Enter 填入 · Esc 关闭</Text>
      </Box>
    </Box>
  );
}
