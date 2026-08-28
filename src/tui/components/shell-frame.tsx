import { Box, Text } from "ink";
import type { PropsWithChildren, ReactNode } from "react";
import { ROOT_SCENE, SCENE_LABELS } from "../shell/router.js";
import { type ShellState, selectStatusBarSummary } from "../shell/state.js";
import type { TerminalCapabilities } from "../types.js";
import { StatusBar } from "./status-bar.js";

export interface ShellFrameProps extends PropsWithChildren {
  state: ShellState;
  capabilities: TerminalCapabilities;
  /** 覆盖在主区之上的临时面板（`/help`、`/status`）。 */
  panel?: ReactNode;
  /** Composer 与命令面板等底部区域。 */
  footer?: ReactNode;
}

/**
 * Shell 外框。
 *
 * 相较此前的三栏布局，这里收敛为「状态栏 + 主区 + 底部输入」的单列结构：
 * 对话是根场景，正文应该拿到全部宽度；原先常驻 Rail 与 Inspector 承载的信息
 * 分别下沉到状态栏（当前位置与告警）与 `/status` 面板（会话与用量明细），
 * 不再持续占用两侧空间。
 */
export function ShellFrame({ state, capabilities, children, panel, footer }: ShellFrameProps) {
  const statusSummary = selectStatusBarSummary(state);
  const isNestedScene = state.activeScene !== ROOT_SCENE;

  return (
    <Box flexDirection="column">
      <StatusBar summary={statusSummary} capabilities={capabilities} />
      <Box marginTop={1} flexDirection="column">
        {panel ?? (
          <>
            {isNestedScene ? (
              <Box marginBottom={1}>
                <Text dimColor>{`Chat › ${SCENE_LABELS[state.activeScene]}  ·  Esc 返回对话`}</Text>
              </Box>
            ) : null}
            {children}
          </>
        )}
      </Box>
      {footer}
    </Box>
  );
}
