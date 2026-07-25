import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli/commands.js";

const cliMocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  runPrompt: vi.fn(),
  startChat: vi.fn(),
}));

const mcpMocks = vi.hoisted(() => ({
  mcpAdd: vi.fn(),
  mcpList: vi.fn(),
  mcpRemove: vi.fn(),
}));

vi.mock("../../src/config/resolver.js", () => ({
  ConfigResolver: vi.fn(() => ({
    resolve: cliMocks.resolve,
  })),
}));

vi.mock("../../src/cli/chat.js", () => ({
  runPrompt: cliMocks.runPrompt,
  startChat: cliMocks.startChat,
}));

vi.mock("../../src/cli/mcp.js", () => ({
  mcpAdd: mcpMocks.mcpAdd,
  mcpList: mcpMocks.mcpList,
  mcpRemove: mcpMocks.mcpRemove,
}));

describe("CLI command framework", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cliMocks.resolve.mockResolvedValue({
      model: { provider: "deepseek", model: "test", apiKey: "sk-test" },
    });
  });

  it("creates a program with the expected name", () => {
    const program = createProgram();
    expect(program.name()).toBe("code-agent");
  });

  it("has the expected description", () => {
    const program = createProgram();
    expect(program.description()).toBe("终端原生编码智能体工具");
  });

  it("includes the init subcommand", () => {
    const program = createProgram();
    const initCmd = program.commands.find((cmd) => cmd.name() === "init");

    expect(initCmd).toBeDefined();
    expect(initCmd?.description()).toBe("在当前项目初始化配置文件");
  });

  it("includes the config subcommand", () => {
    const program = createProgram();
    const configCmd = program.commands.find((cmd) => cmd.name() === "config");

    expect(configCmd).toBeDefined();
    expect(configCmd?.description()).toBe("管理配置");
  });

  it("includes the mcp subcommand", () => {
    const program = createProgram();
    const mcpCmd = program.commands.find((cmd) => cmd.name() === "mcp");

    expect(mcpCmd).toBeDefined();
    expect(mcpCmd?.description()).toBe("管理 MCP 服务");
  });

  it("includes the resume subcommand", () => {
    const program = createProgram();
    const resumeCmd = program.commands.find((cmd) => cmd.name() === "resume");

    expect(resumeCmd).toBeDefined();
    expect(resumeCmd?.description()).toBe("恢复历史会话");
  });

  it("config subcommand includes set/get/list/edit", () => {
    const program = createProgram();
    const configCmd = program.commands.find((cmd) => cmd.name() === "config")!;
    const subCmdNames = configCmd.commands.map((c) => c.name());

    expect(subCmdNames).toContain("set");
    expect(subCmdNames).toContain("get");
    expect(subCmdNames).toContain("list");
    expect(subCmdNames).toContain("edit");
  });

  it("mcp subcommand includes add/remove/list", () => {
    const program = createProgram();
    const mcpCmd = program.commands.find((cmd) => cmd.name() === "mcp")!;
    const subCmdNames = mcpCmd.commands.map((c) => c.name());

    expect(subCmdNames).toContain("add");
    expect(subCmdNames).toContain("remove");
    expect(subCmdNames).toContain("list");
  });

  it("includes all global options", () => {
    const program = createProgram();
    const opts = program.options.map((o) => o.long);

    expect(opts).toContain("--prompt");
    expect(opts).toContain("--mode");
    expect(opts).toContain("--model");
    expect(opts).toContain("--yolo");
    expect(opts).toContain("--continue");
    expect(opts).toContain("--debug");
    expect(opts).toContain("--version");
  });

  it("help includes the Chinese description", () => {
    const program = createProgram();
    const helpInfo = program.helpInformation();

    expect(helpInfo).toContain("终端原生编码智能体工具");
  });

  it("runs a non-interactive task when --prompt is provided", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["--prompt", "hello"], { from: "user" });

    expect(cliMocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ prompt: "hello" }));
    expect(cliMocks.runPrompt).toHaveBeenCalledWith(config, "hello");
    expect(cliMocks.startChat).not.toHaveBeenCalled();
  });

  it("passes the continue intent to interactive chat startup", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["--continue"], { from: "user" });

    expect(cliMocks.startChat).toHaveBeenCalledWith(config, {
      continueLast: true,
    });
  });

  it("resumes the latest session from the resume subcommand", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["resume", "--last"], { from: "user" });

    expect(cliMocks.startChat).toHaveBeenCalledWith(config, {
      continueLast: false,
      resumeLast: true,
      resumeAll: false,
      resumeQuery: undefined,
    });
  });

  it("resumes a matching session by query", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["resume", "fix-auth-timeout", "--all"], { from: "user" });

    expect(cliMocks.startChat).toHaveBeenCalledWith(config, {
      continueLast: false,
      resumeLast: false,
      resumeAll: true,
      resumeQuery: "fix-auth-timeout",
    });
  });

  it("passes through child command flags for mcp add", async () => {
    const program = createProgram();

    await program.parseAsync(
      ["mcp", "add", "filesystem", "npx", "-y", "@modelcontextprotocol/server-filesystem", "."],
      { from: "user" },
    );

    expect(mcpMocks.mcpAdd).toHaveBeenCalledWith(
      "filesystem",
      "npx",
      ["-y", "@modelcontextprotocol/server-filesystem", "."],
      expect.objectContaining({ transport: "stdio" }),
      expect.anything(),
    );
  });

  it("keeps child flags that would otherwise collide with CLI options", async () => {
    const program = createProgram();

    await program.parseAsync(
      ["mcp", "add", "--transport", "sse", "filesystem", "npx", "--debug", "server.js"],
      { from: "user" },
    );

    expect(mcpMocks.mcpAdd).toHaveBeenCalledWith(
      "filesystem",
      "npx",
      ["--debug", "server.js"],
      expect.objectContaining({ transport: "sse" }),
      expect.anything(),
    );
  });
});
