import { useStdin } from "ink";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CommandPalette } from "./components/command-palette.js";
import { Composer } from "./components/composer.js";
import { HelpPanel } from "./components/help-panel.js";
import { ShellFrame } from "./components/shell-frame.js";
import { StatusPanel } from "./components/status-panel.js";
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
import { MCPScene } from "./scenes/mcp.js";
import { PlaceholderScene } from "./scenes/placeholder.js";
import { ResumeScene } from "./scenes/resume.js";
import { ReviewScene } from "./scenes/review.js";
import { SettingsScene } from "./scenes/settings.js";
import { TasksScene } from "./scenes/tasks.js";
import {
  ROOT_SCENE,
  completeSlashCommand,
  findShellCommand,
  getCommandSuggestions,
  parseGotoCommand,
} from "./shell/router.js";
import { dispatchShortcut, normalizeKeyInput } from "./shell/shortcuts.js";
import {
  type ShellState,
  createInitialShellState,
  selectStatusSummary,
  selectTaskBoardSummary,
} from "./shell/state.js";
import type { ShellStore } from "./shell/store.js";
import type { TUIPanel, TUIScene, TerminalCapabilities } from "./types.js";

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
  const pendingApprovalCount = state.approvals.items.filter(
    (approval) => approval.status === "pending",
  ).length;

  if (state.activeScene === "chat") {
    return <ChatScene chat={state.chat} pendingApprovalCount={pendingApprovalCount} />;
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

function renderPanel(panel: TUIPanel, state: ShellState) {
  if (panel === "help") {
    return <HelpPanel />;
  }

  return <StatusPanel summary={selectStatusSummary(state)} />;
}

function subscribeNoop(): () => void {
  return () => undefined;
}

export function TUIApp({
  scene = ROOT_SCENE,
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
  const [activePanel, setActivePanel] = useState<TUIPanel | undefined>();
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const { stdin, setRawMode } = useStdin();
  const composerDraftRef = useRef(composerDraft);
  const paletteRef = useRef(palette);
  const panelRef = useRef(activePanel);
  const suggestionIndexRef = useRef(suggestionIndex);
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

  // slash 建议由草稿派生，不额外持有状态，避免与草稿产生不一致。
  const suggestions = useMemo(() => getCommandSuggestions(composerDraft), [composerDraft]);
  const suggestionsRef = useRef(suggestions);
  const activeSceneRef = useRef(state.activeScene);

  useEffect(() => {
    composerDraftRef.current = composerDraft;
  }, [composerDraft]);

  useEffect(() => {
    paletteRef.current = palette;
  }, [palette]);

  useEffect(() => {
    panelRef.current = activePanel;
  }, [activePanel]);

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  useEffect(() => {
    activeSceneRef.current = state.activeScene;
  }, [state.activeScene]);

  useEffect(() => {
    suggestionIndexRef.current = suggestionIndex;
  }, [suggestionIndex]);

  // 候选项变化后把高亮收回可用范围，否则删字缩短列表时会指向空位。
  useEffect(() => {
    setSuggestionIndex((current) =>
      suggestions.length === 0 ? 0 : Math.min(current, suggestions.length - 1),
    );
  }, [suggestions]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const openCommandPalette = useCallback(() => {
    setPalette((current) => openPalette(current, buildPaletteItems()));
  }, []);

  const runPaletteSelection = useCallback((selectedValue: string) => {
    // 统一填入 composer 由用户确认，命令可能还需要参数，直接执行容易误触。
    setComposerDraft(`${selectedValue} `);
    setComposerNote(undefined);
    setPalette((current) => closePalette(current));
  }, []);

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
      // 面板类命令（/help、/status）不落到 controller，纯本地开合。
      const commandMatch = /^\/(\S+)/u.exec(draft);
      if (commandMatch) {
        const command = findShellCommand(commandMatch[1]);
        const hasArgs = /^\/\S+\s+\S/u.test(draft);

        if (command?.panel) {
          setActivePanel(command.panel);
          setComposerDraft("");
          setComposerNote(undefined);
          return;
        }

        // 无参数的场景命令直接导航，省掉一次 controller 往返。
        if (command?.scene && !hasArgs && command.name !== "resume") {
          shellStore?.navigate(command.scene);
          setComposerDraft("");
          setComposerNote(undefined);
          return;
        }
      }

      const targetScene = parseGotoCommand(draft);
      if (targetScene && shellStore) {
        shellStore.navigate(targetScene);
        setComposerDraft("");
        setComposerNote(undefined);
        return;
      }

      if (draft.startsWith("/goto")) {
        setComposerNote("未知场景");
        return;
      }

      if (draft.startsWith("/")) {
        if (onExecuteCommand) {
          setComposerDraft("");
          setIsBusy(true);
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
            })
            .finally(() => {
              if (isMountedRef.current) {
                setIsBusy(false);
              }
            });
          return;
        }

        setComposerNote("command bridge pending");
        return;
      }

      if (onSubmitTask) {
        shellStore?.navigate(ROOT_SCENE);
        setComposerDraft("");
        setComposerNote(undefined);
        setIsBusy(true);
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
          })
          .finally(() => {
            if (isMountedRef.current) {
              setIsBusy(false);
            }
          });
        return;
      }

      setComposerNote("task execution bridge pending");
    };

    const acceptSuggestion = () => {
      const suggestion = suggestionsRef.current[suggestionIndexRef.current];
      if (!suggestion) {
        return;
      }

      setComposerDraft(`/${suggestion.command.name} `);
      setComposerNote(undefined);
    };

    const handleData = (data: string | Buffer) => {
      const result = dispatchShortcut(normalizeKeyInput(data), {
        draft: composerDraftRef.current,
        hasComposer: true,
        paletteOpen: paletteRef.current.open,
        paletteQuery: paletteRef.current.query,
        panelOpen: panelRef.current !== undefined,
        // 直接问 store 要当前场景：ref 由 effect 回填，按键可能比 effect 先到，
        // 那时读 ref 会拿到上一帧的场景，Esc 就会误判成「已在根场景」而失效。
        activeScene: shellStore?.getState().activeScene ?? activeSceneRef.current,
        suggestionCount: suggestionsRef.current.length,
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

        case "suggestion-move":
          setSuggestionIndex((current) => {
            const total = suggestionsRef.current.length;
            if (total === 0) {
              return 0;
            }
            const next = result.direction === "down" ? current + 1 : current - 1;
            return (next + total) % total;
          });
          return;

        case "suggestion-accept":
          acceptSuggestion();
          return;

        case "close-panel":
          setActivePanel(undefined);
          return;

        case "scene-back":
          shellStore?.navigate(ROOT_SCENE);
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
    <ShellFrame
      state={state}
      capabilities={capabilities}
      panel={activePanel ? renderPanel(activePanel, state) : undefined}
      footer={
        palette.open ? (
          <CommandPalette state={palette} />
        ) : (
          <Composer
            draft={composerDraft}
            note={composerNote}
            suggestions={suggestions}
            selectedSuggestionIndex={suggestionIndex}
            isBusy={isBusy}
          />
        )
      }
    >
      {renderScene(state)}
    </ShellFrame>
  );
}
