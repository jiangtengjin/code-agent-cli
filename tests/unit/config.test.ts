import { describe, expect, it } from "vitest";
import { ConfigResolver, deepMerge } from "../../src/config/resolver.js";
import { ConfigSchema, LLMConfigSchema } from "../../src/config/schema.js";
import { isSensitivePath } from "../../src/utils/path.js";

describe("deepMerge 的 agents 分层", () => {
  it("对 agents 做浅合并而非整体替换", () => {
    const merged = deepMerge(
      { agents: { enabled: true, maxConcurrency: 1 } },
      { agents: { maxConcurrency: 3 } },
    );

    expect(merged.agents).toEqual({ enabled: true, maxConcurrency: 3 });
  });

  it("base 无 agents 时直接采用后层值", () => {
    const merged = deepMerge({}, { agents: { enabled: false } });

    expect(merged.agents).toEqual({ enabled: false });
  });

  it("后层无 agents 时保留 base 值", () => {
    const merged = deepMerge({ agents: { enabled: true } }, { yolo: true });

    expect(merged.agents).toEqual({ enabled: true });
  });

  it("不改动传入的对象", () => {
    const base = { agents: { enabled: true } };
    deepMerge(base, { agents: { maxConcurrency: 2 } });

    expect(base.agents).toEqual({ enabled: true });
  });
});

describe("ConfigSchema 验证", () => {
  it("应接受有效的 LLM 配置", () => {
    const result = LLMConfigSchema.safeParse({
      provider: "deepseek",
      model: "deepseek-coder",
      apiKey: "sk-test",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝空的 provider", () => {
    const result = LLMConfigSchema.safeParse({
      provider: "",
      model: "deepseek-coder",
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝空的 model", () => {
    const result = LLMConfigSchema.safeParse({
      provider: "deepseek",
      model: "",
    });
    expect(result.success).toBe(false);
  });

  it("应接受完整的 Config", () => {
    const result = ConfigSchema.safeParse({
      model: {
        provider: "deepseek",
        model: "deepseek-coder",
        apiKey: "sk-test",
        baseUrl: "https://api.deepseek.com/v1",
      },
      mode: "normal",
      yolo: false,
    });
    expect(result.success).toBe(true);
  });

  it("应接受 agents 配置块", () => {
    const result = ConfigSchema.safeParse({
      agents: { enabled: true, maxConcurrency: 1 },
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝非正整数的 agents.maxConcurrency", () => {
    expect(ConfigSchema.safeParse({ agents: { maxConcurrency: 0 } }).success).toBe(false);
    expect(ConfigSchema.safeParse({ agents: { maxConcurrency: 1.5 } }).success).toBe(false);
  });

  it("应接受二期新增的配置块", () => {
    const result = ConfigSchema.safeParse({
      mode: "plan",
      terminal: {
        shell: "powershell",
        timeout: 60_000,
      },
      costGuard: {
        monthlyBudget: 10,
        warnAtPercent: 80,
      },
      rag: {
        enabled: true,
        maxResults: 8,
        chunkSize: 1200,
      },
      sessions: {
        enabled: true,
        storePath: "D:/tmp/code-agent/sessions",
        defaultScope: "workspace",
        includePromptSessions: false,
      },
    });

    expect(result.success).toBe(true);
  });

  it("应拒绝非法的 mode", () => {
    const result = ConfigSchema.safeParse({
      mode: "turbo",
    });

    expect(result.success).toBe(false);
  });

  it("应拒绝超出范围的成本告警百分比", () => {
    const result = ConfigSchema.safeParse({
      costGuard: {
        monthlyBudget: 10,
        warnAtPercent: 120,
      },
    });

    expect(result.success).toBe(false);
  });

  it("应接受可选的 temperature 和 maxTokens", () => {
    const result = LLMConfigSchema.safeParse({
      provider: "qwen",
      model: "qwen-plus",
      temperature: 0.7,
      maxTokens: 4096,
    });
    expect(result.success).toBe(true);
  });
});

describe("ConfigResolver 配置合并", () => {
  it("应合并 CLI 选项中的 mode", async () => {
    const resolver = new ConfigResolver();
    const config = await resolver.resolve({ mode: "auto" });
    expect(config.mode).toBe("auto");
  });

  it("应合并 CLI 选项中的 model", async () => {
    const resolver = new ConfigResolver();
    const config = await resolver.resolve({ model: "deepseek-coder" });
    expect(config.model?.model).toBe("deepseek-coder");
  });

  it("preserves provider settings when CLI overrides only the model name", async () => {
    const previousEnv = {
      CODE_AGENT_PROVIDER: process.env.CODE_AGENT_PROVIDER,
      CODE_AGENT_MODEL: process.env.CODE_AGENT_MODEL,
      CODE_AGENT_API_KEY: process.env.CODE_AGENT_API_KEY,
      CODE_AGENT_BASE_URL: process.env.CODE_AGENT_BASE_URL,
    };
    process.env.CODE_AGENT_PROVIDER = "deepseek";
    process.env.CODE_AGENT_MODEL = "deepseek-chat";
    process.env.CODE_AGENT_API_KEY = "sk-env";
    process.env.CODE_AGENT_BASE_URL = "https://api.deepseek.com/v1";

    try {
      const resolver = new ConfigResolver();
      const config = await resolver.resolve({ model: "deepseek-coder" });

      expect(config.model).toMatchObject({
        provider: "deepseek",
        model: "deepseek-coder",
        apiKey: "sk-env",
        baseUrl: "https://api.deepseek.com/v1",
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("应合并 CLI 选项中的 yolo", async () => {
    const resolver = new ConfigResolver();
    const config = await resolver.resolve({ yolo: true });
    expect(config.yolo).toBe(true);
  });

  it("applies default session settings when none are configured", async () => {
    const resolver = new ConfigResolver();
    const config = await resolver.resolve({});

    expect(config.sessions).toMatchObject({
      enabled: true,
      defaultScope: "workspace",
      includePromptSessions: false,
    });
    expect(config.sessions?.storePath).toBeTruthy();
  });

  it("preserves explicit session settings from the merged config", async () => {
    const previousEnv = {
      CODE_AGENT_PROVIDER: process.env.CODE_AGENT_PROVIDER,
      CODE_AGENT_MODEL: process.env.CODE_AGENT_MODEL,
      CODE_AGENT_API_KEY: process.env.CODE_AGENT_API_KEY,
      CODE_AGENT_BASE_URL: process.env.CODE_AGENT_BASE_URL,
    };
    delete process.env.CODE_AGENT_PROVIDER;
    delete process.env.CODE_AGENT_MODEL;
    delete process.env.CODE_AGENT_API_KEY;
    delete process.env.CODE_AGENT_BASE_URL;

    try {
      const resolver = new ConfigResolver();
      const config = await resolver.resolve({});

      expect(config.sessions).toMatchObject({
        enabled: true,
        defaultScope: "workspace",
        includePromptSessions: false,
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});

describe("isSensitivePath", () => {
  it("应将 .env 文件标记为敏感", () => {
    expect(isSensitivePath(".env")).toBe(true);
    expect(isSensitivePath(".env.local")).toBe(true);
    expect(isSensitivePath(".env.production")).toBe(true);
  });

  it("应将 .key 和 .pem 文件标记为敏感", () => {
    expect(isSensitivePath("server.key")).toBe(true);
    expect(isSensitivePath("cert.pem")).toBe(true);
  });

  it("应将 credentials 文件标记为敏感", () => {
    expect(isSensitivePath("credentials.json")).toBe(true);
  });

  it("不应将普通源文件标记为敏感", () => {
    expect(isSensitivePath("src/index.ts")).toBe(false);
    expect(isSensitivePath("src/app.js")).toBe(false);
    expect(isSensitivePath("README.md")).toBe(false);
  });

  it("应将 node_modules 中的文件标记为敏感", () => {
    expect(isSensitivePath("node_modules/express/index.js")).toBe(true);
  });

  it("应将 .ssh 目录标记为敏感", () => {
    expect(isSensitivePath(".ssh/id_rsa")).toBe(true);
  });

  it("应将 .aws 目录标记为敏感", () => {
    expect(isSensitivePath(".aws/credentials")).toBe(true);
  });
});
