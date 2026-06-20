/**
 * MCP (Model Context Protocol) 类型定义
 *
 * MCP 是 Anthropic 推出的 AI 工具开放协议，类似 USB-C 标准，
 * 让 AI 应用可以统一接入各种外部工具和服务。
 */

/** MCP Server 暴露的工具定义 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** MCP 工具调用结果 */
export interface MCPCallToolResult {
  content: Array<{
    type: string;
    text?: string;
  }>;
  isError?: boolean;
}
