import * as fs from "node:fs/promises";
import type { ToolDefinition } from "../../types/tool.js";
import { generateDiff } from "../../utils/diff.js";

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

interface EditFileArgs {
  path: string;
  oldString: string;
  newString: string;
}

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description: "精确编辑文件内容（搜索替换）",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径" },
      oldString: { type: "string", description: "需要替换的原始文本" },
      newString: { type: "string", description: "替换后的新文本" },
    },
    required: ["path", "oldString", "newString"],
  },
  requiresConfirm: true,
  async execute(args) {
    const { path, oldString, newString } = args as unknown as EditFileArgs;

    try {
      const content = await fs.readFile(path, "utf-8");

      if (!content.includes(oldString)) {
        return {
          success: false,
          error: `在 ${path} 中未找到匹配的文本。前 100 个字符: "${content.slice(0, 100)}"`,
        };
      }

      const newContent = content.replace(oldString, newString);
      await fs.writeFile(path, newContent, "utf-8");

      const diff = generateDiff(content, newContent);

      return {
        success: true,
        data: { path, diff },
        metadata: { filePath: path, diff },
      };
    } catch (error) {
      return {
        success: false,
        error: `编辑文件失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
