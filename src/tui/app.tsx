import { Box, Text } from "ink";
import { useSyncExternalStore } from "react";
import { ShellFrame } from "./components/shell-frame.js";
import { ChatScene } from "./scenes/chat.js";
import { HomeScene } from "./scenes/home.js";
import { PlaceholderScene } from "./scenes/placeholder.js";
import type { ShellStore } from "./shell/store.js";
import { createInitialShellState, selectHomeSummary, type ShellState } from "./shell/state.js";
import type { TUIScene, TerminalCapabilities } from "./types.js";

export interface TUIAppProps {
  scene?: TUIScene;
  capabilities: TerminalCapabilities;
  shellState?: ShellState;
  shellStore?: Pick<ShellStore, "getState" | "subscribe">;
}

function renderScene(state: ShellState) {
  if (state.activeScene === "home") {
    return <HomeScene summary={selectHomeSummary(state)} />;
  }

  if (state.activeScene === "chat") {
    return <ChatScene chat={state.chat} />;
  }

  return <PlaceholderScene scene={state.activeScene} />;
}

function subscribeNoop(): () => void {
  return () => undefined;
}

export function TUIApp({ scene = "home", capabilities, shellState, shellStore }: TUIAppProps) {
  const fallbackState = shellState ?? createInitialShellState({ activeScene: scene });
  const state = useSyncExternalStore(
    shellStore
      ? (onStoreChange) =>
          shellStore.subscribe(() => {
            onStoreChange();
          })
      : subscribeNoop,
    shellStore ? () => shellStore.getState() : () => fallbackState,
    shellStore ? () => shellStore.getState() : () => fallbackState,
  );

  return (
    <Box flexDirection="column">
      <Text>Code Agent CLI</Text>
      <Text dimColor>Unified TUI foundation</Text>
      <Text>
        Current scene: {state.activeScene} | terminal: {capabilities.level}
      </Text>
      <Text dimColor>Reason: {capabilities.reason}</Text>
      <Box marginTop={1} flexDirection="column">
        <ShellFrame state={state} capabilities={capabilities}>
          {renderScene(state)}
        </ShellFrame>
      </Box>
    </Box>
  );
}
