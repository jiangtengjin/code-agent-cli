import type { MCPServerConfig } from "../../types/config.js";
import type { MCPCallToolResult, MCPToolDefinition } from "../../types/mcp.js";
import type { ToolDefinition, ToolResult } from "../../types/tool.js";
import type { ToolRegistry } from "../registry.js";
import { MCPClient, type MCPClientLike } from "./client.js";

export interface MCPServerManagerOptions {
  createClient?: (serverName: string, config: MCPServerConfig) => MCPClientLike;
  onWarning?: (message: string) => void;
}

export interface MCPSummary {
  servers: number;
  tools: number;
}

interface StartedMCPServer {
  client: MCPClientLike;
}

const DEFAULT_OBJECT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
};

export function buildMCPRegistryToolName(serverName: string, toolName: string): string {
  return `mcp_${normalizeMCPNamePart(serverName)}_${normalizeMCPNamePart(toolName)}`;
}

function normalizeMCPNamePart(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getInputSchema(tool: MCPToolDefinition): Record<string, unknown> {
  return isRecord(tool.inputSchema) ? tool.inputSchema : DEFAULT_OBJECT_SCHEMA;
}

function mapMCPResultData(result: MCPCallToolResult): unknown {
  const { content } = result;
  const hasTextContent = content.some((part) => part.type === "text");
  const allTextContent = content.every((part) => part.type === "text");

  if (hasTextContent && allTextContent) {
    return content.map((part) => part.text ?? "").join("\n");
  }

  return content;
}

function formatMCPResultError(result: MCPCallToolResult): string {
  const data = mapMCPResultData(result);

  if (typeof data === "string" && data.length > 0) {
    return data;
  }

  if (Array.isArray(data) && data.length > 0) {
    return JSON.stringify(data);
  }

  return "MCP server returned an error";
}

export class MCPServerManager {
  private readonly config: Record<string, MCPServerConfig>;
  private readonly createClient: (serverName: string, config: MCPServerConfig) => MCPClientLike;
  private readonly onWarning?: (message: string) => void;
  private readonly startedServers = new Map<string, StartedMCPServer>();
  private registeredToolCount = 0;

  constructor(
    config: Record<string, MCPServerConfig> | undefined,
    private readonly registry: ToolRegistry,
    options: MCPServerManagerOptions = {},
  ) {
    this.config = config ?? {};
    this.createClient =
      options.createClient ?? ((_serverName, serverConfig) => new MCPClient(serverConfig));
    this.onWarning = options.onWarning;
  }

  async startAll(): Promise<void> {
    for (const [serverName, serverConfig] of Object.entries(this.config)) {
      const transport = serverConfig.transport ?? "stdio";

      if (transport !== "stdio") {
        this.warn(
          `Skipping MCP server "${serverName}": unsupported transport "${transport}". Only stdio is supported.`,
        );
        continue;
      }

      await this.startServer(serverName, serverConfig);
    }
  }

  async stopAll(): Promise<void> {
    for (const [serverName, startedServer] of this.startedServers) {
      try {
        await startedServer.client.close();
      } catch (error) {
        this.warn(`Failed to close MCP server "${serverName}": ${formatError(error)}`);
      }
    }

    this.startedServers.clear();
  }

  getSummary(): MCPSummary {
    return {
      servers: this.startedServers.size,
      tools: this.registeredToolCount,
    };
  }

  private async startServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    let client: MCPClientLike | undefined;

    try {
      client = this.createClient(serverName, serverConfig);
      await client.connect();

      const tools = await client.listTools();
      for (const tool of tools) {
        this.registerMCPTool(serverName, client, tool);
      }

      this.startedServers.set(serverName, { client });
    } catch (error) {
      this.warn(`Failed to start MCP server "${serverName}": ${formatError(error)}`);

      if (client !== undefined) {
        await this.closeAfterStartFailure(serverName, client);
      }
    }
  }

  private registerMCPTool(
    serverName: string,
    client: MCPClientLike,
    tool: MCPToolDefinition,
  ): string {
    const registryToolName = buildMCPRegistryToolName(serverName, tool.name);
    const toolDefinition: ToolDefinition = {
      name: registryToolName,
      description: `[MCP ${serverName}/${tool.name}] ${tool.description}`,
      parameters: getInputSchema(tool),
      requiresConfirm: true,
      execute: async (args) => this.executeMCPTool(serverName, tool.name, client, args),
    };

    this.registry.register(toolDefinition);
    this.registeredToolCount += 1;

    return registryToolName;
  }

  private async executeMCPTool(
    serverName: string,
    toolName: string,
    client: MCPClientLike,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    try {
      const result = await client.callTool(toolName, args);

      if (result.isError) {
        return {
          success: false,
          error: `MCP tool ${serverName}/${toolName} failed: ${formatMCPResultError(result)}`,
        };
      }

      return {
        success: true,
        data: mapMCPResultData(result),
      };
    } catch (error) {
      return {
        success: false,
        error: `MCP tool ${serverName}/${toolName} failed: ${formatError(error)}`,
      };
    }
  }

  private async closeAfterStartFailure(serverName: string, client: MCPClientLike): Promise<void> {
    try {
      await client.close();
    } catch (error) {
      this.warn(
        `Failed to close MCP server "${serverName}" after startup error: ${formatError(error)}`,
      );
    }
  }

  private warn(message: string): void {
    this.onWarning?.(message);
  }
}
