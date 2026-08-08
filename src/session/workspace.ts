import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

export interface WorkspaceInfo {
  path: string;
  key: string;
}

function normalizeWorkspacePath(workspacePath: string): string {
  return resolve(workspacePath).replace(/\\/g, "/").toLowerCase();
}

async function hasGitMarker(dirPath: string): Promise<boolean> {
  try {
    await access(resolve(dirPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

function createWorkspaceKey(workspacePath: string): string {
  return createHash("sha1")
    .update(normalizeWorkspacePath(workspacePath))
    .digest("hex")
    .slice(0, 16);
}

export async function resolveWorkspace(cwd: string): Promise<WorkspaceInfo> {
  let current = resolve(cwd);

  while (true) {
    if (await hasGitMarker(current)) {
      return {
        path: current,
        key: createWorkspaceKey(current),
      };
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return {
        path: resolve(cwd),
        key: createWorkspaceKey(cwd),
      };
    }

    current = parent;
  }
}
