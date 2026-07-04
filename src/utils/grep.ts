import * as fs from "node:fs/promises";
import * as path from "node:path";

interface GrepOptions {
  cwd: string;
  extensions?: string[];
  ignoreCase?: boolean;
  maxResults?: number;
}

interface GrepResult {
  file: string;
  line: number;
  content: string;
}

export async function grepNative(
  pattern: string,
  options: GrepOptions,
): Promise<{ results: GrepResult[]; error?: string }> {
  const { cwd, extensions, ignoreCase = false, maxResults = 100 } = options;

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, ignoreCase ? "gi" : "g");
  } catch {
    return { results: [], error: `Invalid regex pattern: ${pattern}` };
  }

  const results: GrepResult[] = [];

  async function walkDir(dir: string): Promise<void> {
    if (results.length >= maxResults) return;

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Permission denied or other read errors — skip this directory
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;

      const fullPath = path.join(dir, entry.name);

      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        if (extensions && extensions.length > 0) {
          const ext = path.extname(entry.name);
          if (!extensions.includes(ext)) {
            continue;
          }
        }

        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) return;

            if (regex.test(lines[i])) {
              results.push({
                file: fullPath,
                line: i + 1,
                content: lines[i],
              });
            }
          }
        } catch {
          // Skip unreadable files (binary, permission denied, etc.)
        }
      }
    }
  }

  await walkDir(cwd);
  return { results };
}
