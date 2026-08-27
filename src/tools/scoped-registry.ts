import { ToolRegistry } from "./registry.js";

/**
 * 判断工具名是否命中白名单模式。
 *
 * 支持精确名与尾部 `*` 前缀通配。通配是 MCP 工具的刚性需求：MCP 工具注册名为
 * `mcp_<server>_<tool>`，具体名字在运行时才由服务器发现，无法写进静态白名单，
 * 只能用 `mcp_*` 或 `mcp_<server>_*` 表达。
 */
export function matchesToolPattern(toolName: string, pattern: string): boolean {
  if (!pattern.endsWith("*")) {
    return toolName === pattern;
  }

  const prefix = pattern.slice(0, -1);
  return toolName.startsWith(prefix);
}

/**
 * 按白名单派生一个收窄的工具注册表。
 *
 * 用于把父级工具集裁剪给受限的执行上下文（edit 模式、子 agent）。
 * 源注册表不受影响。
 */
export function createScopedToolRegistry(
  source: ToolRegistry,
  patterns: readonly string[],
): ToolRegistry {
  const scopedRegistry = new ToolRegistry();

  for (const tool of source.getToolDefinitions()) {
    if (patterns.some((pattern) => matchesToolPattern(tool.name, pattern))) {
      scopedRegistry.register(tool);
    }
  }

  return scopedRegistry;
}
