import { describe, expect, it } from "vitest";
import {
  MCPServerManager,
  buildMCPRegistryToolName,
} from "../../../../src/tools/mcp/manager.js";
import { ToolRegistry } from "../../../../src/tools/registry.js";
import type { ToolDefinition } from "../../../../src/types/tool.js";
import type { MCPCallToolResult, MCPToolDefinition } from "../../../../src/types/mcp.js";

class FakeMCPClient {
  connected = false;
  closed = false;
  callToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  constructor(
    private readonly tools: MCPToolDefinition[] = [],
    private readonly result: MCPCallToolResult = { content: [] },
  ) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult> {
    this.callToolCalls.push({ name, args });
    return this.result;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

function createMCPTool(name: string, description = `Tool ${name}`): MCPToolDefinition {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: {} },
  };
}

function createRegistryTool(name: string, data = "replacement result"): ToolDefinition {
  return {
    name,
    description: "Replacement tool",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ success: true, data }),
  };
}

class FailingSecondRegisterToolRegistry extends ToolRegistry {
  registerCalls = 0;

  override register(tool: ToolDefinition): void {
    this.registerCalls += 1;

    if (this.registerCalls === 2) {
      throw new Error("register failed");
    }

    super.register(tool);
  }
}

describe("buildMCPRegistryToolName", () => {
  it("prefixes server and tool names for registry use", () => {
    expect(buildMCPRegistryToolName("filesystem", "read_file")).toBe(
      "mcp_filesystem_read_file",
    );
    expect(buildMCPRegistryToolName("my-server", "tool.name")).toBe("mcp_my-server_tool_name");
  });
});

describe("MCPServerManager", () => {
  it("starts stdio servers through injected clients and registers discovered tools", async () => {
    const registry = new ToolRegistry();
    const filesystem = new FakeMCPClient([
      {
        name: "read_file",
        description: "Read a file from disk",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ]);

    const manager = new MCPServerManager(
      {
        filesystem: { command: "node", args: ["filesystem-server.js"] },
      },
      registry,
      { createClient: () => filesystem },
    );

    await manager.startAll();

    expect(filesystem.connected).toBe(true);
    expect(registry.has("mcp_filesystem_read_file")).toBe(true);
    expect(manager.getSummary()).toEqual({ servers: 1, tools: 1 });
  });

  it("registers MCP tools with confirmation, provenance, parameters, and execution mapping", async () => {
    const registry = new ToolRegistry();
    const lookupClient = new FakeMCPClient(
      [
        {
          name: "lookup",
          description: "Lookup a value",
          inputSchema: {
            type: "object",
            properties: { key: { type: "string" } },
            required: ["key"],
          },
        },
      ],
      { content: [{ type: "text", text: "lookup result" }] },
    );

    const manager = new MCPServerManager(
      {
        "my-server": {
          command: "node",
          args: ["lookup-server.js"],
          transport: "stdio",
        },
      },
      registry,
      { createClient: () => lookupClient },
    );

    await manager.startAll();

    const registered = registry.get("mcp_my-server_lookup");
    expect(registered).toBeDefined();
    expect(registered?.requiresConfirm).toBe(true);
    expect(registered?.description).toContain("[MCP my-server/lookup]");
    expect(registered?.description).toContain("Lookup a value");
    expect(registered?.parameters).toEqual({
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    });

    const result = await registered?.execute({ key: "customer-123" });

    expect(lookupClient.callToolCalls).toEqual([
      { name: "lookup", args: { key: "customer-123" } },
    ]);
    expect(result).toEqual({ success: true, data: "lookup result" });
  });

  it.each(["http", "sse"] as const)(
    "skips unsupported %s transports and reports them through onWarning",
    async (transport) => {
      const registry = new ToolRegistry();
      const warnings: string[] = [];
      const createdServers: string[] = [];
      const serverName = `${transport}-api`;

      const manager = new MCPServerManager(
        {
          [serverName]: { command: "node", args: ["api-server.js"], transport },
        },
        registry,
        {
          createClient: (serverName: string) => {
            createdServers.push(serverName);
            return new FakeMCPClient();
          },
          onWarning: (message: string) => warnings.push(message),
        },
      );

      await manager.startAll();

      expect(createdServers).toEqual([]);
      expect(warnings.join("\n")).toContain(serverName);
      expect(warnings.join("\n")).toContain(transport);
      expect(manager.getSummary()).toEqual({ servers: 0, tools: 0 });
      expect(registry.list()).toEqual([]);
    },
  );

  it("closes every started client on stopAll", async () => {
    const registry = new ToolRegistry();
    const clients: Record<string, FakeMCPClient> = {
      one: new FakeMCPClient(),
      two: new FakeMCPClient(),
    };

    const manager = new MCPServerManager(
      {
        one: { command: "node", args: ["one.js"] },
        two: { command: "node", args: ["two.js"] },
      },
      registry,
      { createClient: (serverName: string) => clients[serverName] },
    );

    await manager.startAll();
    await manager.stopAll();

    expect(clients.one.closed).toBe(true);
    expect(clients.two.closed).toBe(true);
  });

  it("does not create another client when startAll is called for an already-started server", async () => {
    const registry = new ToolRegistry();
    const warnings: string[] = [];
    const clients: FakeMCPClient[] = [];

    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      {
        createClient: () => {
          const client = new FakeMCPClient([createMCPTool("lookup")]);
          clients.push(client);
          return client;
        },
        onWarning: (message: string) => warnings.push(message),
      },
    );

    await manager.startAll();
    await manager.startAll();

    expect(clients).toHaveLength(1);
    expect(clients[0].connected).toBe(true);
    expect(manager.getSummary()).toEqual({ servers: 1, tools: 1 });
    expect(registry.list()).toEqual(["mcp_filesystem_lookup"]);
    expect(warnings.join("\n")).toContain("filesystem");
    expect(warnings.join("\n")).toContain("already started");

    await manager.stopAll();

    expect(clients[0].closed).toBe(true);
  });

  it("warns and skips normalized tool-name collisions without overwriting earlier tools", async () => {
    const registry = new ToolRegistry();
    const warnings: string[] = [];
    const client = new FakeMCPClient([
      createMCPTool("a.b", "Dotted tool"),
      createMCPTool("a_b", "Underscore tool"),
    ]);

    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      {
        createClient: () => client,
        onWarning: (message: string) => warnings.push(message),
      },
    );

    await manager.startAll();

    expect(registry.list()).toEqual(["mcp_filesystem_a_b"]);
    expect(manager.getSummary()).toEqual({ servers: 1, tools: 1 });
    expect(warnings.join("\n")).toContain("mcp_filesystem_a_b");
    expect(warnings.join("\n")).toContain("a_b");

    await registry.get("mcp_filesystem_a_b")?.execute({ query: "value" });

    expect(client.callToolCalls).toEqual([{ name: "a.b", args: { query: "value" } }]);
  });

  it("unregisters MCP tools and resets summary when stopped", async () => {
    const registry = new ToolRegistry();
    const client = new FakeMCPClient([createMCPTool("lookup")]);
    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      { createClient: () => client },
    );

    await manager.startAll();
    expect(registry.has("mcp_filesystem_lookup")).toBe(true);

    await manager.stopAll();

    expect(client.closed).toBe(true);
    expect(manager.getSummary()).toEqual({ servers: 0, tools: 0 });
    expect(registry.has("mcp_filesystem_lookup")).toBe(false);
    expect(registry.get("mcp_filesystem_lookup")).toBeUndefined();
  });

  it("does not unregister a replacement tool with the same name when stopped", async () => {
    const registry = new ToolRegistry();
    const client = new FakeMCPClient([createMCPTool("lookup")]);
    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      { createClient: () => client },
    );

    await manager.startAll();

    const toolName = "mcp_filesystem_lookup";
    const mcpTool = registry.get(toolName);
    const replacementTool = createRegistryTool(toolName);
    registry.register(replacementTool);

    await manager.stopAll();

    expect(mcpTool).toBeDefined();
    expect(client.closed).toBe(true);
    expect(manager.getSummary()).toEqual({ servers: 0, tools: 0 });
    expect(registry.get(toolName)).toBe(replacementTool);
  });

  it("rolls back owned MCP tools when startup fails during registration", async () => {
    const registry = new FailingSecondRegisterToolRegistry();
    const warnings: string[] = [];
    const client = new FakeMCPClient([createMCPTool("first"), createMCPTool("second")]);
    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      {
        createClient: () => client,
        onWarning: (message: string) => warnings.push(message),
      },
    );

    await manager.startAll();

    expect(registry.registerCalls).toBe(2);
    expect(client.connected).toBe(true);
    expect(client.closed).toBe(true);
    expect(warnings.join("\n")).toContain("register failed");
    expect(manager.getSummary()).toEqual({ servers: 0, tools: 0 });
    expect(registry.list()).toEqual([]);
  });

  it("closes a connected client and leaves no tools when listTools fails", async () => {
    const registry = new ToolRegistry();
    const warnings: string[] = [];
    const client = new FakeMCPClient([createMCPTool("lookup")]);
    client.listTools = async () => {
      throw new Error("list failed");
    };

    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      {
        createClient: () => client,
        onWarning: (message: string) => warnings.push(message),
      },
    );

    await manager.startAll();

    expect(client.connected).toBe(true);
    expect(client.closed).toBe(true);
    expect(warnings.join("\n")).toContain("filesystem");
    expect(warnings.join("\n")).toContain("list failed");
    expect(manager.getSummary()).toEqual({ servers: 0, tools: 0 });
    expect(registry.list()).toEqual([]);
  });

  it("joins multiple text content parts with newlines", async () => {
    const registry = new ToolRegistry();
    const client = new FakeMCPClient(
      [
        {
          name: "lookup",
          description: "Lookup a value",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      {
        content: [
          { type: "text", text: "first line" },
          { type: "text", text: "second line" },
        ],
      },
    );

    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      { createClient: () => client },
    );

    await manager.startAll();

    await expect(registry.get("mcp_filesystem_lookup")?.execute({})).resolves.toEqual({
      success: true,
      data: "first line\nsecond line",
    });
  });

  it("returns raw content arrays when MCP results include non-text content", async () => {
    const registry = new ToolRegistry();
    const content = [
      { type: "text", text: "summary" },
      { type: "image", text: "base64-data" },
    ];
    const client = new FakeMCPClient(
      [
        {
          name: "render",
          description: "Render a result",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      { content },
    );

    const manager = new MCPServerManager(
      { renderer: { command: "node", args: ["server.js"] } },
      registry,
      { createClient: () => client },
    );

    await manager.startAll();

    await expect(registry.get("mcp_renderer_render")?.execute({})).resolves.toEqual({
      success: true,
      data: content,
    });
  });

  it("maps MCP error results to failed tool results with server and tool identity", async () => {
    const registry = new ToolRegistry();
    const client = new FakeMCPClient(
      [
        {
          name: "lookup",
          description: "Lookup a value",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      {
        content: [{ type: "text", text: "permission denied" }],
        isError: true,
      },
    );

    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      { createClient: () => client },
    );

    await manager.startAll();

    const result = await registry.get("mcp_filesystem_lookup")?.execute({});
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("MCP tool filesystem/lookup failed: permission denied");
  });

  it("maps thrown MCP client errors to failed tool results with server and tool identity", async () => {
    const registry = new ToolRegistry();
    const client = new FakeMCPClient([
      {
        name: "lookup",
        description: "Lookup a value",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    client.callTool = async () => {
      throw new Error("connection lost");
    };

    const manager = new MCPServerManager(
      { filesystem: { command: "node", args: ["server.js"] } },
      registry,
      { createClient: () => client },
    );

    await manager.startAll();

    const result = await registry.get("mcp_filesystem_lookup")?.execute({});
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("MCP tool filesystem/lookup failed: connection lost");
  });

  it("warns and continues when one server fails to start", async () => {
    const registry = new ToolRegistry();
    const warnings: string[] = [];
    const workingClient = new FakeMCPClient([
      {
        name: "lookup",
        description: "Lookup a value",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    const failingClient = new FakeMCPClient();
    failingClient.connect = async () => {
      throw new Error("spawn failed");
    };

    const manager = new MCPServerManager(
      {
        broken: { command: "node", args: ["broken.js"] },
        working: { command: "node", args: ["working.js"] },
      },
      registry,
      {
        createClient: (serverName: string) =>
          serverName === "broken" ? failingClient : workingClient,
        onWarning: (message: string) => warnings.push(message),
      },
    );

    await manager.startAll();

    expect(warnings.join("\n")).toContain("broken");
    expect(warnings.join("\n")).toContain("spawn failed");
    expect(registry.has("mcp_working_lookup")).toBe(true);
    expect(manager.getSummary()).toEqual({ servers: 1, tools: 1 });
  });

  it("warns and keeps closing remaining clients when one close fails", async () => {
    const registry = new ToolRegistry();
    const warnings: string[] = [];
    const failingClient = new FakeMCPClient();
    const workingClient = new FakeMCPClient();
    failingClient.close = async () => {
      throw new Error("close failed");
    };

    const manager = new MCPServerManager(
      {
        broken: { command: "node", args: ["broken.js"] },
        working: { command: "node", args: ["working.js"] },
      },
      registry,
      {
        createClient: (serverName: string) =>
          serverName === "broken" ? failingClient : workingClient,
        onWarning: (message: string) => warnings.push(message),
      },
    );

    await manager.startAll();
    await manager.stopAll();

    expect(warnings.join("\n")).toContain("broken");
    expect(warnings.join("\n")).toContain("close failed");
    expect(workingClient.closed).toBe(true);
  });
});
