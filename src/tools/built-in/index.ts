import { ToolRegistry } from "../registry.js";
import {
  createFileTool,
  deleteFileTool,
  editFileTool,
  listDirTool,
  readFileTool,
  writeFileTool,
} from "./file.js";
import { globSearchTool, grepSearchTool } from "./search.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.registerMany([
    readFileTool,
    writeFileTool,
    editFileTool,
    createFileTool,
    deleteFileTool,
    listDirTool,
  ]);

  registry.registerMany([globSearchTool, grepSearchTool]);

  return registry;
}
