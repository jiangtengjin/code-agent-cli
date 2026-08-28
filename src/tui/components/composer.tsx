import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { ShellCommandSuggestion } from "../shell/router.js";
import { SHELL_SHORTCUT_HINTS } from "../shell/shortcuts.js";

/** 建议列表最多展示的条数，避免长列表把对话顶出屏幕。 */
export const MAX_VISIBLE_SUGGESTIONS = 6;

export interface ComposerProps {
  draft: string;
  note?: string;
  suggestions?: ShellCommandSuggestion[];
  selectedSuggestionIndex?: number;
  isBusy?: boolean;
}

/**
 * 计算建议列表的可视窗口。
 *
 * 高亮项始终保持在窗口内，这样用方向键走到第 10 条时列表会跟着滚动，
 * 而不是把选中项留在看不见的地方。
 */
export function getSuggestionWindow(
  total: number,
  selectedIndex: number,
  maxVisible = MAX_VISIBLE_SUGGESTIONS,
): { start: number; end: number } {
  if (total <= maxVisible) {
    return { start: 0, end: total };
  }

  const half = Math.floor(maxVisible / 2);
  const start = Math.min(Math.max(selectedIndex - half, 0), total - maxVisible);
  return { start, end: start + maxVisible };
}

function renderSuggestion(suggestion: ShellCommandSuggestion, isSelected: boolean): ReactElement {
  const { command } = suggestion;

  return (
    <Box key={command.name}>
      <Text color={isSelected ? "cyan" : undefined} dimColor={!isSelected}>
        {isSelected ? "❯ " : "  "}
        {`/${command.name}`.padEnd(12)}
      </Text>
      <Text dimColor>
        {command.argHint ? `${command.argHint} ` : ""}
        {command.description}
      </Text>
    </Box>
  );
}

export function Composer({
  draft,
  note,
  suggestions = [],
  selectedSuggestionIndex = 0,
  isBusy,
}: ComposerProps) {
  const window = getSuggestionWindow(suggestions.length, selectedSuggestionIndex);
  const visible = suggestions.slice(window.start, window.end);
  const hiddenCount = suggestions.length - visible.length;

  return (
    <Box flexDirection="column" marginTop={1}>
      {visible.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          {visible.map((suggestion, index) =>
            renderSuggestion(suggestion, window.start + index === selectedSuggestionIndex),
          )}
          {hiddenCount > 0 ? <Text dimColor>{`  … ${hiddenCount} more`}</Text> : null}
        </Box>
      ) : null}
      <Box>
        <Text color="cyan">{isBusy ? "◐ " : "❯ "}</Text>
        {draft ? <Text>{draft}</Text> : <Text dimColor>描述你要做的事，或输入 / 查看命令</Text>}
      </Box>
      {note ? <Text color="yellow">{`  ${note}`}</Text> : null}
      <Text dimColor>{`  ${SHELL_SHORTCUT_HINTS.join("  ·  ")}`}</Text>
    </Box>
  );
}
