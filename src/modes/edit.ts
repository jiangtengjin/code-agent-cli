import { runExecutionLoop } from "../session/execution.js";
import { createScopedToolRegistry } from "../tools/scoped-registry.js";
import type { ModeHandler, ModeRunResult, RunContext } from "./handler.js";

/**
 * edit 模式的工具白名单。
 *
 * 收窄目的是禁止执行终端命令，而非禁止一切非内置工具。因此 `mcp_*` 在列：
 * MCP 工具注册名为 `mcp_<server>_<tool>`，在运行时才被发现，此前的精确名
 * 白名单会把它们全部误杀。
 */
const SAFE_EDIT_TOOL_PATTERNS = [
  "read_file",
  "write_file",
  "edit_file",
  "create_file",
  "delete_file",
  "list_dir",
  "glob_search",
  "grep_search",
  "mcp_*",
] as const;

export class EditModeHandler implements ModeHandler {
  readonly mode = "edit" as const;
  readonly maxIterations = 10;

  run(input: string, context: RunContext): Promise<ModeRunResult> {
    return runExecutionLoop(
      input,
      {
        ...context,
        toolRegistry: createScopedToolRegistry(context.toolRegistry, SAFE_EDIT_TOOL_PATTERNS),
      },
      this.maxIterations,
    );
  }
}
