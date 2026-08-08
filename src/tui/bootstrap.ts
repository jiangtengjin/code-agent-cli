import { render } from "ink";
import React from "react";
import { type StartChatOptions, startChat } from "../cli/chat.js";
import { InteractionEventEmitter } from "../interaction/emitter.js";
import type { Config } from "../types/config.js";
import { type TUIChatController, createTUIChatController } from "./adapters/chat-controller.js";
import { TUIApp, type TUIAppProps } from "./app.js";
import { detectTerminalCapabilities } from "./capabilities.js";
import { ROOT_SCENE } from "./shell/router.js";
import { type CreateShellStoreOptions, type ShellStore, createShellStore } from "./shell/store.js";
import type { TUIScene, TerminalCapabilities } from "./types.js";

export interface StartInteractiveShellOptions extends StartChatOptions {
  plainUi?: boolean;
  noAltScreen?: boolean;
  initialScene?: TUIScene;
}

export interface InteractiveShellDependencies {
  detectCapabilities?: (options: {
    plainUi?: boolean;
    noAltScreen?: boolean;
  }) => TerminalCapabilities;
  startPlainChat?: typeof startChat;
  renderApp?: (props: TUIAppProps) => unknown | Promise<unknown>;
  createShellStore?: (options: CreateShellStoreOptions) => ShellStore;
  createChatController?: (
    config: Config,
    dependencies: {
      eventEmitter: InteractionEventEmitter;
    },
  ) => TUIChatController;
  interactionEventSource?: InteractionEventEmitter;
}

export interface InteractiveShellResult {
  renderer: "plain" | "ink";
  scene: TUIScene;
  capabilities: TerminalCapabilities;
}

function renderTUIApp(props: TUIAppProps) {
  return render(React.createElement(TUIApp, props), {
    exitOnCtrlC: true,
  });
}

export async function startInteractiveShell(
  config: Config,
  options: StartInteractiveShellOptions = {},
  dependencies: InteractiveShellDependencies = {},
): Promise<InteractiveShellResult> {
  const detectCapabilities = dependencies.detectCapabilities ?? detectTerminalCapabilities;
  const capabilities = detectCapabilities({
    plainUi: options.plainUi,
    noAltScreen: options.noAltScreen,
  });
  // 默认进入对话：启动即可开始干活，其余场景都靠 slash 命令唤起。
  const scene = options.initialScene ?? ROOT_SCENE;

  if (capabilities.level === "plain") {
    const startPlainChat = dependencies.startPlainChat ?? startChat;
    await startPlainChat(config, options);

    return {
      renderer: "plain",
      scene,
      capabilities,
    };
  }

  const renderApp = dependencies.renderApp ?? renderTUIApp;
  const createStore = dependencies.createShellStore ?? createShellStore;
  const interactionEventSource =
    dependencies.interactionEventSource ?? new InteractionEventEmitter();
  const shellStore = createStore({
    initialState: {
      activeScene: scene,
    },
    emitter: interactionEventSource,
  });
  const createChatController = dependencies.createChatController ?? createTUIChatController;
  const chatController = createChatController(config, {
    eventEmitter: interactionEventSource,
  });
  await chatController.initialize({
    initialScene: scene,
    startOptions: options,
  });
  await Promise.resolve(
    renderApp({
      scene,
      capabilities,
      shellStore,
      onSubmitTask: (input) => chatController.submitTask(input),
      onExecuteCommand: (input) => chatController.executeCommand(input),
    }),
  );

  return {
    renderer: "ink",
    scene,
    capabilities,
  };
}
