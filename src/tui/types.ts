export type TUIScene = "chat" | "tasks" | "approvals" | "resume" | "review" | "settings" | "mcp";

/**
 * 覆盖在对话之上的临时面板。
 *
 * 与 `TUIScene` 的区别：scene 是 Shell 的持久位置（由 store 驱动），
 * panel 只是当前会话里的一次性查阅动作，纯由组件本地状态承载，Esc 即关。
 */
export type TUIPanel = "help" | "status";

export type TerminalCapabilityLevel = "full" | "compatible" | "plain";

export interface TerminalCapabilities {
  level: TerminalCapabilityLevel;
  isTTY: boolean;
  supportsAltScreen: boolean;
  supportsColor: boolean;
  reason: string;
}
