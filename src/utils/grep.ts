import * as fs from "node:fs/promises";
import * as path from "node:path";

interface GrepOptions {
  cwd: string;
  include?: string;
  ignoreCase?: boolean;
  maxResults?: number;
}

interface GrepResult {
  file: string;
  line: number;
  content: string;
}

export async function grepNative(pattern: string, options: GrepOptions): Promise<GrepResult[]> {
  const { cwd, include, ignoreCase = false, maxResults = 100 } = options;
  const regex = new RegExp(pattern, ignoreCase ? "gi" : "g");
  const results: GrepResult[] = [];

  async function walkDir(dir: string): Promise<void> {
    if (results.length >= maxResults) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) return;

      const fullPath = path.join(dir, entry.name);

      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        if (include) {
          const ext = path.extname(entry.name);
          if (!include.includes(ext)) {
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
          // Skip unreadable files
        }
      }
    }
  }

  await walkDir(cwd);
  return results;
}
