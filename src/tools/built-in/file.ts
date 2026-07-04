import * as fs from "node:fs/promises";
import * as path from "node:path";
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
        const lines = content.split("\n").length;
        return {
          success: false,
          error: `在 ${path} 中未找到匹配的文本，文件共 ${lines} 行`,
        };
      }

      const newContent = content.replaceAll(oldString, newString);
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

interface WriteFileArgs {
  path: string;
  content: string;
}

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "写入/覆盖文件内容",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径" },
      content: { type: "string", description: "文件内容" },
    },
    required: ["path", "content"],
  },
  requiresConfirm: true,
  async execute(args) {
    const { path: filePath, content } = args as unknown as WriteFileArgs;

    try {
      await fs.writeFile(filePath, content, "utf-8");

      return {
        success: true,
        data: { path: filePath, length: content.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `写入文件失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

interface CreateFileArgs {
  path: string;
  content: string;
}

export const createFileTool: ToolDefinition = {
  name: "create_file",
  description: "创建新文件，自动创建目录",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径" },
      content: { type: "string", description: "文件内容" },
    },
    required: ["path", "content"],
  },
  requiresConfirm: true,
  async execute(args) {
    const { path: filePath, content } = args as unknown as CreateFileArgs;

    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(filePath, content, "utf-8");

      return {
        success: true,
        data: { path: filePath, length: content.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `创建文件失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

interface DeleteFileArgs {
  path: string;
}

export const deleteFileTool: ToolDefinition = {
  name: "delete_file",
  description: "删除文件",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径" },
    },
    required: ["path"],
  },
  requiresConfirm: true,
  async execute(args) {
    const { path: filePath } = args as unknown as DeleteFileArgs;

    try {
      await fs.unlink(filePath);

      return {
        success: true,
        data: { path: filePath },
      };
    } catch (error) {
      return {
        success: false,
        error: `删除文件失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

interface ListDirArgs {
  path: string;
  depth?: number;
  pattern?: string;
}

async function listDirRecursive(
  dirPath: string,
  maxDepth: number,
  currentDepth: number,
): Promise<Array<{ name: string; type: string; path: string }>> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: Array<{ name: string; type: string; path: string }> = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    const entryType = entry.isDirectory() ? "directory" : "file";
    result.push({ name: entry.name, type: entryType, path: entryPath });

    if (entry.isDirectory() && currentDepth < maxDepth) {
      const subEntries = await listDirRecursive(entryPath, maxDepth, currentDepth + 1);
      result.push(...subEntries);
    }
  }

  return result;
}

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  description: "列出目录内容，支持递归深度和模式过滤",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "目录路径" },
      depth: { type: "number", description: "递归深度（默认0，仅列出当前目录）" },
      pattern: { type: "string", description: "文件名过滤模式（支持通配符）" },
    },
    required: ["path"],
  },
  requiresConfirm: false,
  async execute(args) {
    const { path: dirPath, depth = 0, pattern } = args as unknown as ListDirArgs;

    try {
      let entries = await listDirRecursive(dirPath, depth, 0);

      if (pattern) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
        entries = entries.filter((entry) => regex.test(entry.name));
      }

      return {
        success: true,
        data: { entries, count: entries.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `列出目录失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
