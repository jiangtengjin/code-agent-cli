import { describe, expect, it } from "vitest";
import { runTerminalTool } from "../../../src/tools/built-in/terminal.js";

describe("runTerminalTool", () => {
  it("executes a safe command and returns stdout", async () => {
    const result = await runTerminalTool.execute({
      command: 'node -e "process.stdout.write(\'terminal-ok\')"',
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        stdout: "terminal-ok",
        exitCode: 0,
      },
    });
  });

  it("blocks dangerous commands before execution", async () => {
    const result = await runTerminalTool.execute({
      command: "rm -rf /",
    });

    expect(result).toEqual({
      success: false,
      error: "危险命令已被拦截",
    });
  });

  it("fails when the command times out", async () => {
    const result = await runTerminalTool.execute({
      command: 'node -e "setTimeout(() => {}, 200)"',
      timeoutMs: 50,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("超时");
  });
});
