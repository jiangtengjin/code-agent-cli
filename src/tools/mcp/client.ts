import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "../../types/config.js";
import type { MCPCallToolResult, MCPToolDefinition } from "../../types/mcp.js";

export interface MCPClientLike {
  connect(): Promise<void>;
  listTools(): Promise<MCPToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult>;
  close(): Promise<void>;
}

export class MCPClient implements MCPClientLike {
  private readonly client: Client;
  private readonly transport: StdioClientTransport;

  constructor(config: MCPServerConfig) {
    this.client = new Client({ name: "code-agent-cli", version: "0.1.0" });
    this.transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.client.listTools();

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult> {
    const result = await this.client.callTool({ name, arguments: args });
    return result as MCPCallToolResult;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
