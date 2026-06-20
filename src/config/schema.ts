/**
 * 配置校验 Schema
 *
 * 使用 Zod 定义配置的校验规则，确保用户配置的合法性。
 * 在加载和写入配置文件时进行校验，防止无效配置导致运行时错误。
 */

import { z } from "zod";

export const LLMConfigSchema = z.object({
  provider: z.string().min(1, "Provider 不能为空"),
  model: z.string().min(1, "Model 不能为空"),
  apiKey: z.string().optional(),
  baseUrl: z.string().url("必须是有效的 URL").optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const MCPServerConfigSchema = z.object({
  command: z.string().min(1, "命令不能为空"),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
  transport: z.enum(["stdio", "sse", "http"]).optional(),
  url: z.string().url("必须是有效的 URL").optional(),
});

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  model: LLMConfigSchema.optional(),
  models: z.record(LLMConfigSchema).optional(),
  mode: z.string().optional(),
  yolo: z.boolean().optional(),
  mcpServers: z.record(MCPServerConfigSchema).optional(),
  systemPrompt: z.string().optional(),
});
