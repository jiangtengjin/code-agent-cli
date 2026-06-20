import { describe, it, expect } from "vitest";
import { ConfigResolver } from "../../src/config/resolver.js";
import { LLMConfigSchema, ConfigSchema } from "../../src/config/schema.js";
import { isSensitivePath } from "../../src/utils/path.js";

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

  it("应合并 CLI 选项中的 yolo", async () => {
    const resolver = new ConfigResolver();
    const config = await resolver.resolve({ yolo: true });
    expect(config.yolo).toBe(true);
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
