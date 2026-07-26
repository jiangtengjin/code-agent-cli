import { Box, Text, useStdin } from "ink";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ShellFrame } from "./components/shell-frame.js";
import { ChatScene } from "./scenes/chat.js";
import { HomeScene } from "./scenes/home.js";
import { PlaceholderScene } from "./scenes/placeholder.js";
import { TasksScene } from "./scenes/tasks.js";
import { completeGotoCommand, parseGotoCommand } from "./shell/router.js";
import type { ShellStore } from "./shell/store.js";
import {
  createInitialShellState,
  selectHomeSummary,
  selectTaskBoardSummary,
  type ShellState,
} from "./shell/state.js";
import type { TUIScene, TerminalCapabilities } from "./types.js";

export interface TUIAppProps {
  scene?: TUIScene;
  capabilities: TerminalCapabilities;
  shellState?: ShellState;
  shellStore?: Pick<ShellStore, "getState" | "subscribe" | "navigate">;
  onSubmitTask?: (input: string) => Promise<unknown> | unknown;
}

function renderScene(state: ShellState) {
  if (state.activeScene === "home") {
    return <HomeScene summary={selectHomeSummary(state)} />;
  }

  if (state.activeScene === "chat") {
    return <ChatScene chat={state.chat} />;
  }

  if (state.activeScene === "tasks") {
    return <TasksScene summary={selectTaskBoardSummary(state)} />;
  }

  return <PlaceholderScene scene={state.activeScene} />;
}

function subscribeNoop(): () => void {
  return () => undefined;
}

export function TUIApp({
  scene = "home",
  capabilities,
  shellState,
  shellStore,
  onSubmitTask,
}: TUIAppProps) {
  const fallbackState = shellState ?? createInitialShellState({ activeScene: scene });
  const [composerDraft, setComposerDraft] = useState("");
  const [composerNote, setComposerNote] = useState<string | undefined>();
  const { stdin, setRawMode } = useStdin();
  const composerDraftRef = useRef(composerDraft);
  const isMountedRef = useRef(true);
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

  useEffect(() => {
    composerDraftRef.current = composerDraft;
  }, [composerDraft]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const supportsManagedRawMode =
      typeof (stdin as NodeJS.ReadStream & { ref?: () => void }).ref === "function" &&
      typeof (stdin as NodeJS.ReadStream & { unref?: () => void }).unref === "function" &&
      typeof stdin.read === "function";

    if (!stdin.isTTY || !supportsManagedRawMode) {
      return;
    }

    setRawMode(true);

    return () => {
      setRawMode(false);
    };
  }, [stdin, setRawMode]);

  useLayoutEffect(() => {
    const handleData = (data: string | Buffer) => {
      const input = Buffer.isBuffer(data) ? data.toString("utf8") : data;

      if (input === "\u001B") {
        setComposerDraft("");
        setComposerNote(undefined);
        return;
      }

      if (input === "\r" || input === "\n") {
        const draft = composerDraftRef.current.trim();
        if (!draft) {
          return;
        }

        const targetScene = parseGotoCommand(draft);
        if (targetScene && shellStore) {
          shellStore.navigate(targetScene);
          setComposerDraft("");
          setComposerNote(`navigated: ${targetScene}`);
          return;
        }

        if (draft.startsWith("/goto")) {
          setComposerNote("unknown scene");
          return;
        }

        if (onSubmitTask) {
          shellStore?.navigate("chat");
          setComposerDraft("");
          setComposerNote("executing task...");
          Promise.resolve(onSubmitTask(draft))
            .then(() => {
              if (!isMountedRef.current) {
                return;
              }
              setComposerNote(undefined);
            })
            .catch((error: unknown) => {
              if (!isMountedRef.current) {
                return;
              }
              if (!composerDraftRef.current) {
                setComposerDraft(draft);
              }
              setComposerNote(error instanceof Error ? error.message : String(error));
            });
          return;
        }

        setComposerNote("task execution bridge pending");
        return;
      }

      if (input === "\t") {
        const completed = completeGotoCommand(composerDraftRef.current);
        if (completed) {
          setComposerDraft(completed);
          setComposerNote(undefined);
        }
        return;
      }

      if (input === "\b" || input === "\u007F") {
        setComposerDraft((currentDraft) => currentDraft.slice(0, -1));
        setComposerNote(undefined);
        return;
      }

      if (/^[\x20-\x7E]+$/u.test(input)) {
        setComposerDraft((currentDraft) => currentDraft + input);
        setComposerNote(undefined);
      }
    };

    stdin.on("data", handleData);

    return () => {
      stdin.removeListener("data", handleData);
    };
  }, [onSubmitTask, shellStore, stdin]);

  return (
    <Box flexDirection="column">
      <Text>Code Agent CLI</Text>
      <Text dimColor>Unified TUI foundation</Text>
      <Text>
        Current scene: {state.activeScene} | terminal: {capabilities.level}
      </Text>
      <Text dimColor>Reason: {capabilities.reason}</Text>
      <Box marginTop={1} flexDirection="column">
        <ShellFrame
          state={state}
          capabilities={capabilities}
          composerDraft={composerDraft}
          composerNote={composerNote}
        >
          {renderScene(state)}
        </ShellFrame>
      </Box>
    </Box>
  );
}
