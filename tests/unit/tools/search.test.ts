import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { globSearchTool, grepSearchTool } from "../../../src/tools/built-in/search.js";

describe("glob_search tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
    await fs.writeFile(path.join(tempDir, "test.txt"), "content");
    await fs.writeFile(path.join(tempDir, "test.ts"), "content");
    await fs.writeFile(path.join(tempDir, "other.js"), "content");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("应该搜索匹配的文件", async () => {
    const result = await globSearchTool.execute({
      pattern: "*.txt",
      path: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("files");
    expect(result.data).toHaveProperty("count");
    expect(
      result.data.files.some((f: string) => f.endsWith("test.txt") || f.endsWith("test.txt\\")),
    ).toBe(true);
    expect(result.data.count).toBe(1);
  });

  it("应该有正确的工具定义", () => {
    expect(globSearchTool.name).toBe("glob_search");
    expect(globSearchTool.requiresConfirm).toBe(false);
  });
});

describe("grep_search tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
    await fs.writeFile(path.join(tempDir, "test.txt"), "Hello World\nTest Line");
    await fs.writeFile(path.join(tempDir, "other.txt"), "Another Line");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("应该搜索文件内容", async () => {
    const result = await grepSearchTool.execute({
      pattern: "Hello",
      path: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("results");
    expect(result.data).toHaveProperty("count");
    expect(result.data.results.length).toBeGreaterThan(0);
    expect(result.data.results[0]).toHaveProperty("content", "Hello World");
    expect(result.data.results[0]).toHaveProperty("file");
    expect(result.data.results[0].file).toContain("test.txt");
  });

  it("应该支持 ignoreCase 选项", async () => {
    const result = await grepSearchTool.execute({
      pattern: "hello",
      path: tempDir,
      ignoreCase: true,
    });

    expect(result.success).toBe(true);
    expect(result.data.results.length).toBeGreaterThan(0);
    expect(result.data.results[0].content).toBe("Hello World");
  });

  it("应该支持 maxResults 限制", async () => {
    const result = await grepSearchTool.execute({
      pattern: "Line",
      path: tempDir,
      maxResults: 1,
    });

    expect(result.success).toBe(true);
    expect(result.data.results.length).toBe(1);
  });

  it("应该支持 include 过滤文件扩展名", async () => {
    const result = await grepSearchTool.execute({
      pattern: "Hello",
      path: tempDir,
      include: "*.txt",
    });

    expect(result.success).toBe(true);
    expect(result.data.results.length).toBeGreaterThan(0);
    expect(result.data.results[0].file).toContain(".txt");
  });

  it("搜索不存在的路径应返回错误", async () => {
    const result = await grepSearchTool.execute({
      pattern: "Hello",
      path: "/nonexistent/path/that/does/not/exist",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("不存在");
  });

  it("无效正则表达式应返回错误", async () => {
    const result = await grepSearchTool.execute({
      pattern: "(",
      path: tempDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid regex");
  });

  it("应该有正确的工具定义", () => {
    expect(grepSearchTool.name).toBe("grep_search");
    expect(grepSearchTool.requiresConfirm).toBe(false);
  });
});
