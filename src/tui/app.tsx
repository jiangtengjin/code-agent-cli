import { Box, Text, useStdin } from "ink";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CommandPalette } from "./components/command-palette.js";
import { ShellFrame } from "./components/shell-frame.js";
import {
  type PaletteState,
  buildPaletteItems,
  closePalette,
  createPaletteState,
  movePaletteSelection,
  openPalette,
  selectPaletteItem,
  setPaletteQuery,
} from "./hooks/use-command-palette.js";
import { ApprovalsScene } from "./scenes/approvals.js";
import { ChatScene } from "./scenes/chat.js";
import { HomeScene } from "./scenes/home.js";
import { MCPScene } from "./scenes/mcp.js";
import { PlaceholderScene } from "./scenes/placeholder.js";
import { ResumeScene } from "./scenes/resume.js";
import { ReviewScene } from "./scenes/review.js";
import { SettingsScene } from "./scenes/settings.js";
import { TasksScene } from "./scenes/tasks.js";
import {
  SCENE_LABELS,
  SHELL_SCENES,
  SHELL_SLASH_COMMANDS,
  completeSlashCommand,
  parseGotoCommand,
} from "./shell/router.js";
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
  const [palette, setPalette] = useState<PaletteState>(createPaletteState);
  const { stdin, setRawMode } = useStdin();
  const composerDraftRef = useRef(composerDraft);
  const paletteRef = useRef(palette);
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
    paletteRef.current = palette;
  }, [palette]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const openCommandPalette = useCallback(() => {
    const items = buildPaletteItems(SHELL_SCENES, SCENE_LABELS, SHELL_SLASH_COMMANDS);
    setPalette((current) => openPalette({ ...current, items }));
  }, []);

  const runPaletteSelection = useCallback(
    (selectedValue: string) => {
      if (selectedValue.startsWith("/")) {
        // 命令：填入 composer 由用户补充参数并确认，避免误执行。
        setComposerDraft(selectedValue);
        setComposerNote("fill args, enter to run");
      } else {
        // 场景：直接导航。
        shellStore?.navigate(selectedValue as TUIScene);
        setComposerNote(`navigated: ${selectedValue}`);
        setComposerDraft("");
      }
      setPalette((current) => closePalette(current));
    },
    [shellStore],
  );

  // 命令面板的键盘交互复用同一个 stdin 处理入口（见下方 handleData），
  // 这样既兼容 ink-testing-library（useInput 需要 stdin.ref，测试桩不支持），
  // 也保证面板与 composer 不会同时消费按键。

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
        paletteOpen: paletteRef.current.open,
        paletteQuery: paletteRef.current.query,
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
          const completed = completeSlashCommand(result.draft);
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

        case "open-palette":
          openCommandPalette();
          return;

        case "palette-close":
          setPalette((current) => closePalette(current));
          return;

        case "palette-move":
          setPalette((current) => movePaletteSelection(current, result.direction));
          return;

        case "palette-submit": {
          const selectedItem = selectPaletteItem(paletteRef.current);
          if (selectedItem) {
            runPaletteSelection(selectedItem.item.value);
          }
          return;
        }

        case "palette-query":
          setPalette((current) => setPaletteQuery(current, result.query));
          return;

        default:
          return;
      }
    };

    stdin.on("data", handleData);

    return () => {
      stdin.removeListener("data", handleData);
    };
  }, [onExecuteCommand, onSubmitTask, shellStore, stdin, openCommandPalette, runPaletteSelection]);

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
      {palette.open ? <CommandPalette state={palette} /> : null}
    </Box>
  );
}
