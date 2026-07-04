import * as fs from "node:fs/promises";
import type { ToolDefinition } from "../../types/tool.js";

interface ReadFileArgs {
  path: string;
  offset?: number;
  limit?: number;
}

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "读取指定文件的内容，支持行范围",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径" },
      offset: { type: "number", description: "起始行号（从1开始）" },
      limit: { type: "number", description: "读取行数" },
    },
    required: ["path"],
  },
  requiresConfirm: false,
  async execute(args) {
    const { path, offset, limit } = args as unknown as ReadFileArgs;

    try {
      const content = await fs.readFile(path, "utf-8");
      const lines = content.split("\n");

      const start = offset ? Math.max(1, offset) : 1;
      const end = limit ? Math.min(lines.length, start + limit - 1) : lines.length;
      const selectedLines = lines.slice(start - 1, end);

      return {
        success: true,
        data: {
          content: selectedLines.join("\n"),
          totalLines: lines.length,
          startLine: start,
          endLine: end,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `读取文件失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
