import { render } from "ink";
import React from "react";
import { type StartChatOptions, startChat } from "../cli/chat.js";
import type { Config } from "../types/config.js";
import { TUIApp, type TUIAppProps } from "./app.js";
import { detectTerminalCapabilities } from "./capabilities.js";
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
  const scene = options.initialScene ?? "home";

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
  await Promise.resolve(renderApp({ scene, capabilities }));

  return {
    renderer: "ink",
    scene,
    capabilities,
  };
}
