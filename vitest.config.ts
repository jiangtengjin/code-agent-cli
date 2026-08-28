import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

/**
 * 极简 .env 读取。
 *
 * 不引入 dotenv：这里只需要在测试进程里注入几个凭据变量，且必须不覆盖已存在的
 * 环境变量，以便 CI 用真实环境变量覆盖本地文件。
 */
function loadDotEnv(): Record<string, string> {
  const result: Record<string, string> = {};

  try {
    const content = readFileSync(".env", "utf-8");

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key && value && process.env[key] === undefined) {
        result[key] = value;
      }
    }
  } catch {
    // 没有 .env 是正常情况，集成测试会自动跳过
  }

  return result;
}

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // 集成测试的凭据放在 .env（已 gitignore）
    env: loadDotEnv(),
  },
});
