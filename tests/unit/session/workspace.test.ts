import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWorkspace } from "../../../src/session/workspace.js";

describe("resolveWorkspace", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const tempDir of tempDirs) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the nearest ancestor with a .git directory as the workspace root", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-agent-workspace-"));
    tempDirs.push(tempDir);
    const repoRoot = path.join(tempDir, "repo");
    const nestedDir = path.join(repoRoot, "packages", "cli");

    await fs.mkdir(path.join(repoRoot, ".git"), { recursive: true });
    await fs.mkdir(nestedDir, { recursive: true });

    const workspace = await resolveWorkspace(nestedDir);

    expect(workspace.path).toBe(repoRoot);
    expect(workspace.key).toBeTruthy();
  });

  it("treats the cwd as the workspace root when no git marker exists", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-agent-workspace-"));
    tempDirs.push(tempDir);
    const cwd = path.join(tempDir, "standalone");
    await fs.mkdir(cwd, { recursive: true });

    const workspace = await resolveWorkspace(cwd);

    expect(workspace.path).toBe(cwd);
    expect(workspace.key).toBeTruthy();
  });

  it("accepts a .git file as a repository marker", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-agent-workspace-"));
    tempDirs.push(tempDir);
    const repoRoot = path.join(tempDir, "repo-file");
    const nestedDir = path.join(repoRoot, "src");

    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(repoRoot, ".git"), "gitdir: ../.git/modules/repo-file");

    const workspace = await resolveWorkspace(nestedDir);

    expect(workspace.path).toBe(repoRoot);
  });
});
