import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFileTool,
  deleteFileTool,
  editFileTool,
  listDirTool,
  readFileTool,
  writeFileTool,
} from "../../../src/tools/built-in/file.js";

describe("read_file tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("应该读取文件内容", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "Hello\nWorld\nTest");

    const result = await readFileTool.execute({ path: filePath });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      content: "Hello\nWorld\nTest",
      totalLines: 3,
      startLine: 1,
      endLine: 3,
    });
  });

  it("应该支持行范围", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "Line1\nLine2\nLine3\nLine4\nLine5");

    const result = await readFileTool.execute({ path: filePath, offset: 2, limit: 2 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      content: "Line2\nLine3",
      totalLines: 5,
      startLine: 2,
      endLine: 3,
    });
  });

  it("应该处理文件不存在的情况", async () => {
    const result = await readFileTool.execute({ path: "/nonexistent/file.txt" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("读取文件失败");
  });

  it("应该有正确的工具定义", () => {
    expect(readFileTool.name).toBe("read_file");
    expect(readFileTool.description).toBe("读取指定文件的内容，支持行范围");
    expect(readFileTool.requiresConfirm).toBe(false);
  });
});

describe("edit_file tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("应该替换文本", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "Hello World");

    const result = await editFileTool.execute({
      path: filePath,
      oldString: "World",
      newString: "TypeScript",
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.diff).toContain("+ Hello TypeScript");

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("Hello TypeScript");
  });

  it("应该处理未找到匹配的情况", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "Hello World");

    const result = await editFileTool.execute({
      path: filePath,
      oldString: "Nonexistent",
      newString: "Text",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("未找到匹配的文本");
  });

  it("应该替换所有匹配的文本", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "a b a b a");

    const result = await editFileTool.execute({
      path: filePath,
      oldString: "a",
      newString: "c",
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("c b c b c");
  });

  it("应该处理文件不存在的情况", async () => {
    const result = await editFileTool.execute({
      path: "/nonexistent/file.txt",
      oldString: "test",
      newString: "new",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("编辑文件失败");
  });

  it("应该有正确的工具定义", () => {
    expect(editFileTool.name).toBe("edit_file");
    expect(editFileTool.description).toBe("精确编辑文件内容（搜索替换）");
    expect(editFileTool.requiresConfirm).toBe(true);
  });
});

describe("write_file tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("应该写入文件", async () => {
    const filePath = path.join(tempDir, "test.txt");

    const result = await writeFileTool.execute({
      path: filePath,
      content: "Hello World",
    });

    expect(result.success).toBe(true);

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("Hello World");
  });

  it("应该处理写入失败的情况", async () => {
    const result = await writeFileTool.execute({
      path: "/nonexistent/directory/file.txt",
      content: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("写入文件失败");
  });

  it("应该有正确的工具定义", () => {
    expect(writeFileTool.name).toBe("write_file");
    expect(writeFileTool.requiresConfirm).toBe(true);
  });
});

describe("create_file tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("应该创建文件和目录", async () => {
    const filePath = path.join(tempDir, "subdir", "test.txt");

    const result = await createFileTool.execute({
      path: filePath,
      content: "Hello World",
    });

    expect(result.success).toBe(true);

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("Hello World");
  });

  it("应该处理创建失败的情况", async () => {
    const result = await createFileTool.execute({
      path: "C:\\Users\\nonexistent_user\\file.txt",
      content: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("创建文件失败");
  });

  it("应该有正确的工具定义", () => {
    expect(createFileTool.name).toBe("create_file");
    expect(createFileTool.requiresConfirm).toBe(true);
  });
});

describe("delete_file tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("应该删除文件", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "Hello World");

    const result = await deleteFileTool.execute({ path: filePath });

    expect(result.success).toBe(true);

    const exists = await fs.access(filePath).then(
      () => true,
      () => false,
    );
    expect(exists).toBe(false);
  });

  it("应该处理文件不存在的情况", async () => {
    const result = await deleteFileTool.execute({ path: "/nonexistent/file.txt" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("删除文件失败");
  });

  it("应该有正确的工具定义", () => {
    expect(deleteFileTool.name).toBe("delete_file");
    expect(deleteFileTool.requiresConfirm).toBe(true);
  });
});

describe("list_dir tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
    await fs.writeFile(path.join(tempDir, "file1.txt"), "content1");
    await fs.writeFile(path.join(tempDir, "file2.txt"), "content2");
    await fs.mkdir(path.join(tempDir, "subdir"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("应该列出目录内容", async () => {
    const result = await listDirTool.execute({ path: tempDir });

    expect(result.success).toBe(true);
    expect(result.data.entries).toHaveLength(3);
    expect(result.data.count).toBe(3);

    const names = result.data.entries.map((e: { name: string }) => e.name).sort();
    expect(names).toEqual(["file1.txt", "file2.txt", "subdir"]);

    const types = result.data.entries.map((e: { type: string }) => e.type).sort();
    expect(types).toEqual(["directory", "file", "file"]);
  });

  it("应该支持递归深度", async () => {
    await fs.writeFile(path.join(tempDir, "subdir", "nested.txt"), "nested");

    const result = await listDirTool.execute({ path: tempDir, depth: 1 });

    expect(result.success).toBe(true);
    expect(result.data.entries).toHaveLength(4);
    expect(result.data.entries.some((e: { name: string }) => e.name === "nested.txt")).toBe(true);
  });

  it("应该支持模式过滤", async () => {
    const result = await listDirTool.execute({ path: tempDir, pattern: "*.txt" });

    expect(result.success).toBe(true);
    expect(result.data.entries).toHaveLength(2);
    expect(result.data.entries.every((e: { name: string }) => e.name.endsWith(".txt"))).toBe(true);
  });

  it("应该处理目录不存在的情况", async () => {
    const result = await listDirTool.execute({ path: "/nonexistent/dir" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("列出目录失败");
  });

  it("应该有正确的工具定义", () => {
    expect(listDirTool.name).toBe("list_dir");
    expect(listDirTool.requiresConfirm).toBe(false);
  });
});
