import { Box, Text } from "ink";
import type { PropsWithChildren } from "react";
import { Composer } from "./composer.js";
import { Inspector } from "./inspector.js";
import { Rail } from "./rail.js";
import { StatusBar } from "./status-bar.js";
import {
  selectInspectorSummary,
  selectRailItems,
  selectStatusBarSummary,
  type ShellState,
} from "../shell/state.js";
import type { TerminalCapabilities } from "../types.js";

export interface ShellFrameProps extends PropsWithChildren {
  state: ShellState;
  capabilities: TerminalCapabilities;
}

export function ShellFrame({ state, capabilities, children }: ShellFrameProps) {
  const statusSummary = selectStatusBarSummary(state);
  const railItems = selectRailItems(state);
  const inspectorSummary = selectInspectorSummary(state);

  return (
    <Box flexDirection="column">
      <StatusBar summary={statusSummary} capabilities={capabilities} />
      <Box marginTop={1} flexDirection="row">
        <Rail items={railItems} />
        <Box flexGrow={1} flexShrink={1} flexDirection="column" paddingX={1}>
          <Text>Main</Text>
          {children}
        </Box>
        <Inspector summary={inspectorSummary} />
      </Box>
      <Composer activeScene={state.activeScene} />
    </Box>
  );
}
