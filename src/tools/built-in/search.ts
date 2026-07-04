import { glob } from "glob";
import * as fs from "node:fs/promises";
import type { ToolDefinition } from "../../types/tool.js";
import { grepNative } from "../../utils/grep.js";

interface GlobSearchArgs {
  pattern: string;
  path?: string;
  ignore?: string[];
}

interface GrepSearchArgs {
  pattern: string;
  path?: string;
  include?: string;
  ignoreCase?: boolean;
  maxResults?: number;
}

export const globSearchTool: ToolDefinition = {
  name: "glob_search",
  description: "使用glob模式搜索文件",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "glob模式" },
      path: { type: "string", description: "搜索路径" },
      ignore: { type: "array", items: { type: "string" }, description: "忽略的模式" },
    },
    required: ["pattern"],
  },
  requiresConfirm: false,
  async execute(args) {
    const { pattern, path: searchPath = ".", ignore = [] } = args as unknown as GlobSearchArgs;

    try {
      const files = await glob(pattern, {
        cwd: searchPath,
        ignore: ["node_modules", ".git", ...ignore],
        absolute: true,
      });

      return {
        success: true,
        data: { files, count: files.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

export const grepSearchTool: ToolDefinition = {
  name: "grep_search",
  description: "搜索文件内容，支持正则表达式",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "搜索模式（支持正则）" },
      path: { type: "string", description: "搜索路径" },
      include: { type: "string", description: "包含的文件模式" },
      ignoreCase: { type: "boolean", description: "忽略大小写" },
      maxResults: { type: "number", description: "最大结果数" },
    },
    required: ["pattern"],
  },
  requiresConfirm: false,
  async execute(args) {
    const {
      pattern,
      path: searchPath = ".",
      include,
      ignoreCase = false,
      maxResults = 100,
    } = args as unknown as GrepSearchArgs;

    try {
      try {
        const stat = await fs.stat(searchPath);
        if (!stat.isDirectory()) {
          return { success: false, error: `搜索路径不是目录: ${searchPath}` };
        }
      } catch {
        return { success: false, error: `搜索路径不存在: ${searchPath}` };
      }

      let extensions: string[] | undefined;
      if (include) {
        const dotIdx = include.lastIndexOf(".");
        const ext = dotIdx >= 0 ? include.slice(dotIdx) : include;
        extensions = [ext];
      }

      const { results, error: grepError } = await grepNative(pattern, {
        cwd: searchPath,
        extensions,
        ignoreCase,
        maxResults,
      });

      if (grepError) {
        return { success: false, error: grepError };
      }

      return {
        success: true,
        data: { results, count: results.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
