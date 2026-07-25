import { beforeEach, describe, expect, it, vi } from "vitest";

const managerMocks = vi.hoisted(() => ({
  getGlobalConfigPath: vi.fn(() => "/mock/config.jsonc"),
  loadConfigFile: vi.fn(),
  writeConfigFile: vi.fn(),
}));

vi.mock("../../../src/config/manager.js", () => managerMocks);

describe("MCP CLI commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managerMocks.loadConfigFile.mockReturnValue({
      model: { provider: "deepseek", model: "test", apiKey: "sk-test" },
      mcpServers: {},
    });
  });

  it("adds an MCP server to global config", async () => {
    const { mcpAdd } = await import("../../../src/cli/mcp.js");

    mcpAdd("filesystem", "npx", ["-y", "@modelcontextprotocol/server-filesystem", "."], {});

    expect(managerMocks.writeConfigFile).toHaveBeenCalledWith(
      "/mock/config.jsonc",
      expect.objectContaining({
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
            transport: "stdio",
          },
        },
      }),
    );
  });

  it("removes an MCP server from global config", async () => {
    managerMocks.loadConfigFile.mockReturnValue({
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
          transport: "stdio",
        },
      },
    });
    const { mcpRemove } = await import("../../../src/cli/mcp.js");

    mcpRemove("filesystem");

    expect(managerMocks.writeConfigFile).toHaveBeenCalledWith(
      "/mock/config.jsonc",
      expect.objectContaining({
        mcpServers: {},
      }),
    );
  });

  it("prints configured MCP servers", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    managerMocks.loadConfigFile.mockReturnValue({
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
          transport: "stdio",
        },
      },
    });
    const { mcpList } = await import("../../../src/cli/mcp.js");

    mcpList();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("filesystem"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("npx"));

    logSpy.mockRestore();
  });
});
