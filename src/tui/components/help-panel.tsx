import { Box, Text } from "ink";
import {
  SHELL_SLASH_COMMANDS,
  type ShellCommandGroup,
  type ShellSlashCommand,
} from "../shell/router.js";

const GROUP_LABELS: Record<ShellCommandGroup, string> = {
  navigate: "工作台",
  session: "会话",
  system: "通用",
};

const GROUP_ORDER: ShellCommandGroup[] = ["navigate", "session", "system"];

const MODE_HINTS = [
  ["normal", "标准问答，按需调用工具"],
  ["auto", "AI 自主规划并执行"],
  ["plan", "先出计划，确认后执行"],
  ["edit", "仅编辑文件，不执行命令"],
] as const;

const KEY_HINTS = [
  ["/", "唤起命令建议"],
  ["Tab", "补全 / 采纳建议"],
  ["↑ ↓", "在建议间移动"],
  ["Esc", "关闭面板、清空草稿、返回对话"],
  ["Ctrl+.", "打开命令面板"],
  ["Ctrl+C", "退出"],
] as const;

function renderCommand(command: ShellSlashCommand) {
  return (
    <Box key={command.name}>
      <Text color="cyan">{`  /${command.name}`.padEnd(14)}</Text>
      <Text dimColor>{command.argHint ? `${command.argHint} ` : ""}</Text>
      <Text>{command.description}</Text>
    </Box>
  );
}

/**
 * `/help` 面板：新用户的第一站。
 *
 * 按用途分组列出全部命令，并把模式语义和快捷键一并交代清楚——
 * 这正是「不知道各模式有什么功能」的直接答案。
 */
export function HelpPanel() {
  return (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Text bold>命令</Text>
      {GROUP_ORDER.map((group) => {
        const commands = SHELL_SLASH_COMMANDS.filter((command) => command.group === group);
        if (commands.length === 0) {
          return null;
        }

        return (
          <Box key={group} flexDirection="column" marginTop={1}>
            <Text dimColor>{GROUP_LABELS[group]}</Text>
            {commands.map((command) => renderCommand(command))}
          </Box>
        );
      })}

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>模式（/mode 切换）</Text>
        {MODE_HINTS.map(([name, description]) => (
          <Box key={name}>
            <Text color="cyan">{`  ${name}`.padEnd(14)}</Text>
            <Text>{description}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>快捷键</Text>
        {KEY_HINTS.map(([key, description]) => (
          <Box key={key}>
            <Text color="cyan">{`  ${key}`.padEnd(14)}</Text>
            <Text>{description}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Esc 关闭</Text>
      </Box>
    </Box>
  );
}
