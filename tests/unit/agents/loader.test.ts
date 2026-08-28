import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProjectAgentsDir,
  loadAgentDefinitions,
  parseAgentFile,
} from "../../../src/agents/loader.js";

vi.mock("../../../src/utils/logger.js", () => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setDebug: vi.fn(),
}));

const homedirMock = vi.hoisted(() => vi.fn(() => "/nonexistent-home"));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: homedirMock };
});

describe("parseAgentFile", () => {
  it("parses frontmatter and body into a definition", () => {
    const definition = parseAgentFile(
      "/agents/code-explorer.md",
      [
        "---",
        "description: 定位实现与追踪调用链",
        "tools: [read_file, glob_search]",
        "maxIterations: 20",
        "model: fast",
        "---",
        "",
        "你是代码库探索专家。",
        "",
        "回报时必须包含文件路径。",
      ].join("\n"),
      "project",
    );

    expect(definition).toEqual({
      name: "code-explorer",
      description: "定位实现与追踪调用链",
      systemPrompt: "你是代码库探索专家。\n\n回报时必须包含文件路径。",
      tools: ["read_file", "glob_search"],
      maxIterations: 20,
      model: "fast",
      source: "project",
    });
  });

  it("derives the name from the filename and lowercases it", () => {
    const definition = parseAgentFile(
      "/agents/Code-Reviewer.md",
      "---\ndescription: review\n---\nbody",
      "global",
    );

    expect(definition?.name).toBe("code-reviewer");
  });

  it("applies a default iteration cap when unspecified", () => {
    const definition = parseAgentFile(
      "/agents/a.md",
      "---\ndescription: d\n---\nbody",
      "project",
    );

    expect(definition?.maxIterations).toBe(15);
  });

  it("ignores a non-positive or fractional iteration cap", () => {
    const zero = parseAgentFile(
      "/agents/a.md",
      "---\ndescription: d\nmaxIterations: 0\n---\nbody",
      "project",
    );
    const fractional = parseAgentFile(
      "/agents/b.md",
      "---\ndescription: d\nmaxIterations: 2.5\n---\nbody",
      "project",
    );

    expect(zero?.maxIterations).toBe(15);
    expect(fractional?.maxIterations).toBe(15);
  });

  it("strips quotes from scalar values", () => {
    const definition = parseAgentFile(
      "/agents/a.md",
      '---\ndescription: "quoted desc"\nmodel: \'fast\'\n---\nbody',
      "project",
    );

    expect(definition?.description).toBe("quoted desc");
    expect(definition?.model).toBe("fast");
  });

  it("accepts a comma-separated tools string", () => {
    const definition = parseAgentFile(
      "/agents/a.md",
      "---\ndescription: d\ntools: read_file, grep_search\n---\nbody",
      "project",
    );

    expect(definition?.tools).toEqual(["read_file", "grep_search"]);
  });

  it("leaves tools undefined when absent so the agent inherits all tools", () => {
    const definition = parseAgentFile(
      "/agents/a.md",
      "---\ndescription: d\n---\nbody",
      "project",
    );

    expect(definition?.tools).toBeUndefined();
  });

  it("skips files without a description", () => {
    expect(parseAgentFile("/agents/a.md", "---\ntools: [read_file]\n---\nbody", "project")).toBeUndefined();
  });

  it("skips files with an empty body", () => {
    expect(parseAgentFile("/agents/a.md", "---\ndescription: d\n---\n", "project")).toBeUndefined();
  });

  it("skips reserved mode names", () => {
    for (const name of ["normal", "auto", "plan", "edit"]) {
      expect(
        parseAgentFile(`/agents/${name}.md`, "---\ndescription: d\n---\nbody", "project"),
      ).toBeUndefined();
    }
  });

  it("skips invalid agent names", () => {
    expect(
      parseAgentFile("/agents/Bad_Name.md", "---\ndescription: d\n---\nbody", "project"),
    ).toBeUndefined();
  });

  it("treats a file without frontmatter as body-only and skips it for missing description", () => {
    expect(parseAgentFile("/agents/a.md", "just a prompt", "project")).toBeUndefined();
  });

  it("handles CRLF line endings", () => {
    const definition = parseAgentFile(
      "/agents/a.md",
      "---\r\ndescription: d\r\n---\r\nbody line\r\n",
      "project",
    );

    expect(definition?.description).toBe("d");
    expect(definition?.systemPrompt).toBe("body line");
  });
});

describe("loadAgentDefinitions", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "agent-loader-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function writeProjectAgent(name: string, content: string): void {
    const dir = getProjectAgentsDir(workspace);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), content, "utf-8");
  }

  it("returns an empty list when no agents directory exists", () => {
    expect(loadAgentDefinitions(workspace)).toEqual([]);
  });

  it("loads project agent definitions", () => {
    writeProjectAgent("explorer.md", "---\ndescription: explore\n---\nprompt");

    const definitions = loadAgentDefinitions(workspace);

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      name: "explorer",
      description: "explore",
      source: "project",
    });
  });

  it("keeps loading remaining agents when one file is malformed", () => {
    writeProjectAgent("good.md", "---\ndescription: good\n---\nprompt");
    writeProjectAgent("no-description.md", "---\ntools: [read_file]\n---\nprompt");
    writeProjectAgent("empty-body.md", "---\ndescription: d\n---\n");

    const definitions = loadAgentDefinitions(workspace);

    expect(definitions.map((entry) => entry.name)).toEqual(["good"]);
  });

  it("ignores non-markdown files", () => {
    const dir = getProjectAgentsDir(workspace);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "notes.txt"), "not an agent", "utf-8");
    writeFileSync(join(dir, "real.md"), "---\ndescription: d\n---\nprompt", "utf-8");

    expect(loadAgentDefinitions(workspace).map((entry) => entry.name)).toEqual(["real"]);
  });

  it("loads global agents and marks their source", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-home-"));
    homedirMock.mockReturnValue(home);
    const globalDir = join(home, ".config", "code-agent", "agents");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, "shared.md"), "---\ndescription: global\n---\nprompt", "utf-8");

    try {
      const definitions = loadAgentDefinitions(workspace);

      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toMatchObject({ name: "shared", source: "global" });
    } finally {
      homedirMock.mockReturnValue("/nonexistent-home");
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("lets a project agent fully override a same-named global one", () => {
    const home = mkdtempSync(join(tmpdir(), "agent-home-"));
    homedirMock.mockReturnValue(home);
    const globalDir = join(home, ".config", "code-agent", "agents");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "shared.md"),
      "---\ndescription: global desc\ntools: [read_file]\nmaxIterations: 5\n---\nglobal prompt",
      "utf-8",
    );
    writeProjectAgent("shared.md", "---\ndescription: project desc\n---\nproject prompt");

    try {
      const definitions = loadAgentDefinitions(workspace);

      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toEqual({
        name: "shared",
        description: "project desc",
        systemPrompt: "project prompt",
        tools: undefined,
        maxIterations: 15,
        model: undefined,
        source: "project",
      });
    } finally {
      homedirMock.mockReturnValue("/nonexistent-home");
      rmSync(home, { recursive: true, force: true });
    }
  });
});
