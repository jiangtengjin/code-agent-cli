import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "../../types/tool.js";
import { isDangerousCommand } from "../../utils/security.js";

const exec = promisify(execCallback);
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

interface RunTerminalArgs {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

function normalizeOutput(value: string | undefined): string {
  return (value ?? "").trimEnd();
}

export const runTerminalTool: ToolDefinition = {
  name: "run_terminal",
  description: "执行终端命令，返回 stdout/stderr 和退出状态",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "要执行的终端命令" },
      cwd: { type: "string", description: "命令工作目录，默认当前目录" },
      timeoutMs: { type: "number", description: "命令超时时间（毫秒），默认 30000" },
    },
    required: ["command"],
  },
  requiresConfirm: true,
  async execute(args) {
    const { command, cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = args as unknown as RunTerminalArgs;

    if (!command?.trim()) {
      return {
        success: false,
        error: "命令不能为空",
      };
    }

    if (isDangerousCommand(command)) {
      return {
        success: false,
        error: "危险命令已被拦截",
      };
    }

    try {
      const { stdout, stderr } = await exec(command, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER_BYTES,
        windowsHide: true,
      });

      return {
        success: true,
        data: {
          stdout: normalizeOutput(stdout),
          stderr: normalizeOutput(stderr),
          exitCode: 0,
        },
      };
    } catch (error) {
      const execError = error as Error & {
        stdout?: string;
        stderr?: string;
        code?: number | string | null;
        signal?: string | null;
        killed?: boolean;
      };

      if (execError.killed || /timed out/i.test(execError.message)) {
        return {
          success: false,
          error: `命令执行超时（>${timeoutMs}ms）`,
          data: {
            stdout: normalizeOutput(execError.stdout),
            stderr: normalizeOutput(execError.stderr),
          },
        };
      }

      return {
        success: false,
        error: `命令执行失败: ${execError.message}`,
        data: {
          stdout: normalizeOutput(execError.stdout),
          stderr: normalizeOutput(execError.stderr),
          exitCode: execError.code ?? null,
          signal: execError.signal ?? null,
        },
      };
    }
  },
};
