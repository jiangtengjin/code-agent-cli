import { Box, Text, useStdin } from "ink";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ShellFrame } from "./components/shell-frame.js";
import { ApprovalsScene } from "./scenes/approvals.js";
import { ChatScene } from "./scenes/chat.js";
import { HomeScene } from "./scenes/home.js";
import { MCPScene } from "./scenes/mcp.js";
import { PlaceholderScene } from "./scenes/placeholder.js";
import { ResumeScene } from "./scenes/resume.js";
import { ReviewScene } from "./scenes/review.js";
import { SettingsScene } from "./scenes/settings.js";
import { TasksScene } from "./scenes/tasks.js";
import { completeGotoCommand, parseGotoCommand } from "./shell/router.js";
import { dispatchShortcut, normalizeKeyInput } from "./shell/shortcuts.js";
import {
  type ShellState,
  createInitialShellState,
  selectHomeSummary,
  selectTaskBoardSummary,
} from "./shell/state.js";
import type { ShellStore } from "./shell/store.js";
import type { TUIScene, TerminalCapabilities } from "./types.js";

export interface TUIAppProps {
  scene?: TUIScene;
  capabilities: TerminalCapabilities;
  shellState?: ShellState;
  shellStore?: Pick<ShellStore, "getState" | "subscribe" | "navigate">;
  onSubmitTask?: (input: string) => Promise<unknown> | unknown;
  onExecuteCommand?: (input: string) =>
    | Promise<{ handled: boolean; note?: string; navigateTo?: TUIScene }>
    | {
        handled: boolean;
        note?: string;
        navigateTo?: TUIScene;
      };
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

  if (state.activeScene === "approvals") {
    return <ApprovalsScene approvals={state.approvals} />;
  }

  if (state.activeScene === "resume") {
    return <ResumeScene catalog={state.resumeCatalog} resume={state.resume} />;
  }

  if (state.activeScene === "review") {
    return <ReviewScene findings={state.reviewFindings} />;
  }

  if (state.activeScene === "settings") {
    return <SettingsScene snapshot={state.configSnapshot} validation={state.configValidation} />;
  }

  if (state.activeScene === "mcp") {
    return <MCPScene servers={state.mcpServers} />;
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
  onExecuteCommand,
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
    const submitDraft = (draft: string) => {
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

      if (draft.startsWith("/")) {
        if (onExecuteCommand) {
          setComposerDraft("");
          setComposerNote("executing command...");
          Promise.resolve(onExecuteCommand(draft))
            .then((result) => {
              if (!isMountedRef.current) {
                return;
              }
              if (result.navigateTo) {
                shellStore?.navigate(result.navigateTo);
              }
              setComposerNote(result.note);
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

        setComposerNote("command bridge pending");
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
    };

    const handleData = (data: string | Buffer) => {
      const result = dispatchShortcut(normalizeKeyInput(data), {
        draft: composerDraftRef.current,
        hasComposer: true,
      });

      switch (result.type) {
        case "clear-draft":
          setComposerDraft("");
          setComposerNote(undefined);
          return;

        case "submit":
          submitDraft(result.draft);
          return;

        case "complete": {
          const completed = completeGotoCommand(result.draft);
          if (completed) {
            setComposerDraft(completed);
            setComposerNote(undefined);
          }
          return;
        }

        case "delete-char":
          setComposerDraft((currentDraft) => currentDraft.slice(0, -1));
          setComposerNote(undefined);
          return;

        case "insert-char":
          setComposerDraft((currentDraft) => currentDraft + result.text);
          setComposerNote(undefined);
          return;

        default:
          return;
      }
    };

    stdin.on("data", handleData);

    return () => {
      stdin.removeListener("data", handleData);
    };
  }, [onExecuteCommand, onSubmitTask, shellStore, stdin]);

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
