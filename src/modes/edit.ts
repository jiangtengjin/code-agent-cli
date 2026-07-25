import { runExecutionLoop } from "../session/execution.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ModeHandler, ModeRunResult, RunContext } from "./handler.js";

const SAFE_EDIT_TOOL_NAMES = new Set([
  "read_file",
  "write_file",
  "edit_file",
  "create_file",
  "delete_file",
  "list_dir",
  "glob_search",
  "grep_search",
]);

function createEditToolRegistry(source: RunContext["toolRegistry"]): ToolRegistry {
  const scopedRegistry = new ToolRegistry();

  for (const tool of source.getToolDefinitions()) {
    if (SAFE_EDIT_TOOL_NAMES.has(tool.name)) {
      scopedRegistry.register(tool);
    }
  }

  return scopedRegistry;
}

export class EditModeHandler implements ModeHandler {
  readonly mode = "edit" as const;
  readonly maxIterations = 10;

  run(input: string, context: RunContext): Promise<ModeRunResult> {
    return runExecutionLoop(
      input,
      {
        ...context,
        toolRegistry: createEditToolRegistry(context.toolRegistry),
      },
      this.maxIterations,
    );
  }
}
