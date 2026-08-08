import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry } from "../../../src/tools/built-in/index.js";

describe("chat集成", () => {
  it("应该能够创建工具注册表并获取工具定义", () => {
    const registry = createDefaultToolRegistry();
    const definitions = registry.getToolDefinitions();

    // 验证工具定义格式正确
    for (const def of definitions) {
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
      expect(def).toHaveProperty("parameters");
      expect(def).toHaveProperty("execute");
      expect(typeof def.execute).toBe("function");
    }
  });
});
