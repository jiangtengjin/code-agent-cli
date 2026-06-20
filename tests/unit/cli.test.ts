import { describe, it, expect } from "vitest";
import { createProgram } from "../../src/cli/commands.js";

describe("CLI 命令框架", () => {
  it("应创建具有正确名称的程序", () => {
    const program = createProgram();
    expect(program.name()).toBe("code-agent");
  });

  it("应包含正确的描述", () => {
    const program = createProgram();
    expect(program.description()).toBe("终端原生编码智能体工具");
  });

  it("应包含 init 子命令", () => {
    const program = createProgram();
    const initCmd = program.commands.find((cmd) => cmd.name() === "init");
    expect(initCmd).toBeDefined();
    expect(initCmd?.description()).toBe("在当前项目初始化配置文件");
  });

  it("应包含 config 子命令", () => {
    const program = createProgram();
    const configCmd = program.commands.find((cmd) => cmd.name() === "config");
    expect(configCmd).toBeDefined();
    expect(configCmd?.description()).toBe("管理配置");
  });

  it("config 子命令应包含 set/get/list/edit", () => {
    const program = createProgram();
    const configCmd = program.commands.find((cmd) => cmd.name() === "config")!;
    const subCmdNames = configCmd.commands.map((c) => c.name());
    expect(subCmdNames).toContain("set");
    expect(subCmdNames).toContain("get");
    expect(subCmdNames).toContain("list");
    expect(subCmdNames).toContain("edit");
  });

  it("应包含所有全局选项", () => {
    const program = createProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain("--prompt");
    expect(opts).toContain("--mode");
    expect(opts).toContain("--model");
    expect(opts).toContain("--yolo");
    expect(opts).toContain("--debug");
    expect(opts).toContain("--version");
  });

  it("--help 应包含中文描述", () => {
    const program = createProgram();
    const helpInfo = program.helpInformation();
    expect(helpInfo).toContain("终端原生编码智能体工具");
  });
});
