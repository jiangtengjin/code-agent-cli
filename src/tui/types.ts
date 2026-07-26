export type TUIScene =
  | "home"
  | "chat"
  | "approvals"
  | "resume"
  | "review"
  | "settings"
  | "mcp"
  | "tasks";

export type TerminalCapabilityLevel = "full" | "compatible" | "plain";

export interface TerminalCapabilities {
  level: TerminalCapabilityLevel;
  isTTY: boolean;
  supportsAltScreen: boolean;
  supportsColor: boolean;
  reason: string;
}
