import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../../../src/tools/registry.js";
import {
  createScopedToolRegistry,
  matchesToolPattern,
} from "../../../src/tools/scoped-registry.js";
import type { ToolDefinition } from "../../../src/types/tool.js";

function tool(name: string): ToolDefinition {
  return {
    name,
    description: `Tool ${name}`,
    parameters: { type: "object", properties: {} },
    execute: vi.fn(async () => ({ success: true })),
  };
}

describe("matchesToolPattern", () => {
  it("matches exact names", () => {
    expect(matchesToolPattern("read_file", "read_file")).toBe(true);
    expect(matchesToolPattern("write_file", "read_file")).toBe(false);
  });

  it("matches prefix wildcards", () => {
    expect(matchesToolPattern("mcp_github_issue", "mcp_*")).toBe(true);
    expect(matchesToolPattern("mcp_github_issue", "mcp_github_*")).toBe(true);
    expect(matchesToolPattern("mcp_slack_post", "mcp_github_*")).toBe(false);
    expect(matchesToolPattern("read_file", "mcp_*")).toBe(false);
  });

  it("treats a bare wildcard as match-all", () => {
    expect(matchesToolPattern("anything", "*")).toBe(true);
  });
});

describe("createScopedToolRegistry", () => {
  it("keeps only whitelisted tools and leaves the source untouched", () => {
    const source = new ToolRegistry();
    source.registerMany([tool("read_file"), tool("run_terminal"), tool("glob_search")]);

    const scoped = createScopedToolRegistry(source, ["read_file", "glob_search"]);

    expect(scoped.list().sort()).toEqual(["glob_search", "read_file"]);
    expect(scoped.has("run_terminal")).toBe(false);
    expect(source.list()).toHaveLength(3);
  });

  it("includes MCP tools via prefix wildcard", () => {
    const source = new ToolRegistry();
    source.registerMany([
      tool("read_file"),
      tool("run_terminal"),
      tool("mcp_github_create_issue"),
      tool("mcp_slack_post_message"),
    ]);

    const scoped = createScopedToolRegistry(source, ["read_file", "mcp_*"]);

    expect(scoped.list().sort()).toEqual([
      "mcp_github_create_issue",
      "mcp_slack_post_message",
      "read_file",
    ]);
  });

  it("scopes MCP tools down to a single server", () => {
    const source = new ToolRegistry();
    source.registerMany([tool("mcp_github_create_issue"), tool("mcp_slack_post_message")]);

    const scoped = createScopedToolRegistry(source, ["mcp_github_*"]);

    expect(scoped.list()).toEqual(["mcp_github_create_issue"]);
  });

  it("returns an empty registry for an empty whitelist", () => {
    const source = new ToolRegistry();
    source.register(tool("read_file"));

    expect(createScopedToolRegistry(source, []).list()).toEqual([]);
  });

  it("preserves the original tool instance so execute still works", async () => {
    const source = new ToolRegistry();
    const original = tool("read_file");
    source.register(original);

    const scoped = createScopedToolRegistry(source, ["read_file"]);
    await scoped.get("read_file")?.execute({ path: "README.md" });

    expect(original.execute).toHaveBeenCalledWith({ path: "README.md" });
  });
});
