import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli/commands.js";

const cliMocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  runPrompt: vi.fn(),
  startChat: vi.fn(),
  startInteractiveShell: vi.fn(),
  setupWizard: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  configEdit: vi.fn(),
  configGet: vi.fn(),
  configList: vi.fn(),
  configSet: vi.fn(),
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

vi.mock("../../src/tui/bootstrap.js", () => ({
  startInteractiveShell: cliMocks.startInteractiveShell,
}));

vi.mock("../../src/config/wizard.js", () => ({
  setupWizard: cliMocks.setupWizard,
}));

vi.mock("../../src/cli/config.js", () => ({
  configEdit: configMocks.configEdit,
  configGet: configMocks.configGet,
  configList: configMocks.configList,
  configSet: configMocks.configSet,
}));

vi.mock("../../src/cli/mcp.js", () => ({
  mcpAdd: mcpMocks.mcpAdd,
  mcpList: mcpMocks.mcpList,
  mcpRemove: mcpMocks.mcpRemove,
}));

describe("CLI command framework", () => {
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;

  function setInteractiveTerminal(isInteractive: boolean) {
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: isInteractive,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: isInteractive,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setInteractiveTerminal(true);
    cliMocks.resolve.mockResolvedValue({
      model: { provider: "deepseek", model: "test", apiKey: "sk-test" },
    });
  });

  afterAll(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutIsTTY,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinIsTTY,
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
    const configCmd = program.commands.find((cmd) => cmd.name() === "config");
    expect(configCmd).toBeDefined();
    const subCmdNames = (configCmd ?? { commands: [] }).commands.map((cmd) => cmd.name());

    expect(subCmdNames).toContain("set");
    expect(subCmdNames).toContain("get");
    expect(subCmdNames).toContain("list");
    expect(subCmdNames).toContain("edit");
  });

  it("mcp subcommand includes add/remove/list", () => {
    const program = createProgram();
    const mcpCmd = program.commands.find((cmd) => cmd.name() === "mcp");
    expect(mcpCmd).toBeDefined();
    const subCmdNames = (mcpCmd ?? { commands: [] }).commands.map((cmd) => cmd.name());

    expect(subCmdNames).toContain("add");
    expect(subCmdNames).toContain("remove");
    expect(subCmdNames).toContain("list");
  });

  it("includes all global options", () => {
    const program = createProgram();
    const opts = program.options.map((option) => option.long);

    expect(opts).toContain("--prompt");
    expect(opts).toContain("--mode");
    expect(opts).toContain("--model");
    expect(opts).toContain("--yolo");
    expect(opts).toContain("--continue");
    expect(opts).toContain("--plain-ui");
    expect(opts).toContain("--no-alt-screen");
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
    expect(cliMocks.startInteractiveShell).not.toHaveBeenCalled();
  });

  it("starts the interactive shell for the default command without resume flags", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync([], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config);
    expect(cliMocks.startChat).not.toHaveBeenCalled();
  });

  it("passes the continue intent to the unified tui startup", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["--continue"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      continueLast: true,
      initialScene: "chat",
    });
    expect(cliMocks.startChat).not.toHaveBeenCalled();
  });

  it("passes plain ui terminal flags into the interactive shell", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["--plain-ui", "--no-alt-screen"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      plainUi: true,
      noAltScreen: true,
    });
  });

  it("resumes the latest session from the resume subcommand inside tui", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["resume", "--last"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      initialScene: "chat",
      resumeLast: true,
    });
  });

  it("resumes a matching session by query inside tui", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["resume", "fix-auth-timeout", "--all"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      initialScene: "chat",
      resumeAll: true,
      resumeQuery: "fix-auth-timeout",
    });
  });

  it("opens the resume scene when no query is provided", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["resume"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      initialScene: "resume",
      resumePicker: true,
    });
  });

  it("forks from the matched session when resume --fork is provided", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["resume", "fix-auth-timeout", "--fork"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      initialScene: "chat",
      resumeQuery: "fix-auth-timeout",
      resumeFork: true,
    });
  });

  it("opens the settings scene for the bare config command in an interactive terminal", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["config"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      initialScene: "settings",
    });
  });

  it("opens the mcp scene for the bare mcp command in an interactive terminal", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["mcp"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      initialScene: "mcp",
    });
  });

  it("routes init into the settings scene in an interactive terminal", async () => {
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["init"], { from: "user" });

    expect(cliMocks.startInteractiveShell).toHaveBeenCalledWith(config, {
      initialScene: "settings",
    });
    expect(cliMocks.setupWizard).not.toHaveBeenCalled();
  });

  it("falls back to config list for the bare config command outside an interactive terminal", async () => {
    setInteractiveTerminal(false);
    const program = createProgram();

    await program.parseAsync(["config"], { from: "user" });

    expect(configMocks.configList).toHaveBeenCalledTimes(1);
    expect(cliMocks.startInteractiveShell).not.toHaveBeenCalled();
  });

  it("falls back to the MCP list command outside an interactive terminal", async () => {
    setInteractiveTerminal(false);
    const program = createProgram();

    await program.parseAsync(["mcp"], { from: "user" });

    expect(mcpMocks.mcpList).toHaveBeenCalledTimes(1);
    expect(cliMocks.startInteractiveShell).not.toHaveBeenCalled();
  });

  it("falls back to the setup wizard for init outside an interactive terminal", async () => {
    setInteractiveTerminal(false);
    const program = createProgram();

    await program.parseAsync(["init"], { from: "user" });

    expect(cliMocks.setupWizard).toHaveBeenCalledTimes(1);
    expect(cliMocks.startInteractiveShell).not.toHaveBeenCalled();
  });

  it("falls back to the legacy resume flow outside an interactive terminal", async () => {
    setInteractiveTerminal(false);
    const config = { model: { provider: "deepseek", model: "test", apiKey: "sk-test" } };
    cliMocks.resolve.mockResolvedValue(config);
    const program = createProgram();

    await program.parseAsync(["resume", "fix-auth-timeout", "--all"], { from: "user" });

    expect(cliMocks.startChat).toHaveBeenCalledWith(config, {
      continueLast: false,
      resumeLast: false,
      resumeAll: true,
      resumeQuery: "fix-auth-timeout",
      resumePicker: false,
      resumeFork: false,
    });
    expect(cliMocks.startInteractiveShell).not.toHaveBeenCalled();
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
