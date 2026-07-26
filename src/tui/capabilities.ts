import type { TerminalCapabilities } from "./types.js";

export interface DetectTerminalCapabilitiesOptions {
  plainUi?: boolean;
  noAltScreen?: boolean;
}

export interface TerminalRuntime {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  env: NodeJS.ProcessEnv;
}

function getDefaultRuntime(): TerminalRuntime {
  return {
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    env: process.env,
  };
}

export function detectTerminalCapabilities(
  options: DetectTerminalCapabilitiesOptions = {},
  runtime: Partial<TerminalRuntime> = {},
): TerminalCapabilities {
  const resolvedRuntime = { ...getDefaultRuntime(), ...runtime };
  const isTTY = resolvedRuntime.stdinIsTTY && resolvedRuntime.stdoutIsTTY;
  const env = resolvedRuntime.env;
  const supportsColor = !("NO_COLOR" in env) && env.FORCE_COLOR !== "0";

  if (options.plainUi) {
    return {
      level: "plain",
      isTTY,
      supportsAltScreen: false,
      supportsColor,
      reason: "plain-ui-flag",
    };
  }

  if (!isTTY) {
    return {
      level: "plain",
      isTTY: false,
      supportsAltScreen: false,
      supportsColor: false,
      reason: "non-tty",
    };
  }

  if (options.noAltScreen) {
    return {
      level: "compatible",
      isTTY: true,
      supportsAltScreen: false,
      supportsColor,
      reason: "no-alt-screen-flag",
    };
  }

  if (env.CI === "true" || env.TERM?.toLowerCase() === "dumb") {
    return {
      level: "compatible",
      isTTY: true,
      supportsAltScreen: false,
      supportsColor,
      reason: env.CI === "true" ? "ci-environment" : "dumb-term",
    };
  }

  return {
    level: "full",
    isTTY: true,
    supportsAltScreen: true,
    supportsColor,
    reason: "interactive-terminal",
  };
}
