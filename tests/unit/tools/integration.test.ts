import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry } from "../../../src/tools/built-in/index.js";

describe("工具集成", () => {
  it("应该创建默认工具注册表", () => {
    const registry = createDefaultToolRegistry();

    expect(registry.has("read_file")).toBe(true);
    expect(registry.has("edit_file")).toBe(true);
    expect(registry.has("write_file")).toBe(true);
    expect(registry.has("create_file")).toBe(true);
    expect(registry.has("delete_file")).toBe(true);
    expect(registry.has("list_dir")).toBe(true);
    expect(registry.has("glob_search")).toBe(true);
    expect(registry.has("grep_search")).toBe(true);
    expect(registry.has("run_terminal")).toBe(true);
  });

  it("应该返回所有工具定义", () => {
    const registry = createDefaultToolRegistry();
    const definitions = registry.getToolDefinitions();

    expect(definitions.length).toBeGreaterThanOrEqual(9);
  });
});
