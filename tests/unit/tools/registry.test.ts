import { beforeEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../../../src/tools/registry.js";
import type { ToolDefinition } from "../../../src/types/tool.js";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("应该注册工具", () => {
    const tool: ToolDefinition = {
      name: "test-tool",
      description: "测试工具",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ success: true }),
    };

    registry.register(tool);

    expect(registry.has("test-tool")).toBe(true);
    expect(registry.get("test-tool")).toBe(tool);
  });

  it("应该批量注册工具", () => {
    const tool1: ToolDefinition = {
      name: "tool1",
      description: "工具1",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ success: true }),
    };

    const tool2: ToolDefinition = {
      name: "tool2",
      description: "工具2",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ success: true }),
    };

    registry.registerMany([tool1, tool2]);

    expect(registry.has("tool1")).toBe(true);
    expect(registry.has("tool2")).toBe(true);
  });

  it("应该返回所有工具定义", () => {
    const tool: ToolDefinition = {
      name: "test-tool",
      description: "测试工具",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ success: true }),
    };

    registry.register(tool);

    const definitions = registry.getToolDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toBe(tool);
  });

  it("应该返回所有工具名称", () => {
    const tool1: ToolDefinition = {
      name: "tool1",
      description: "工具1",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ success: true }),
    };

    const tool2: ToolDefinition = {
      name: "tool2",
      description: "工具2",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ success: true }),
    };

    registry.registerMany([tool1, tool2]);

    const names = registry.list();
    expect(names).toContain("tool1");
    expect(names).toContain("tool2");
  });

  it("应该处理不存在的工具", () => {
    expect(registry.has("nonexistent")).toBe(false);
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("should unregister tools by name", () => {
    const tool: ToolDefinition = {
      name: "test-tool",
      description: "test tool",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ success: true }),
    };

    registry.register(tool);

    expect(registry.unregister("test-tool")).toBe(true);
    expect(registry.has("test-tool")).toBe(false);
    expect(registry.get("test-tool")).toBeUndefined();
    expect(registry.unregister("test-tool")).toBe(false);
  });
});
