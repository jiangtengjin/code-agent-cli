/**
 * 配置校验 Schema
 *
 * 使用 Zod 定义配置的校验规则，确保用户配置的合法性。
 * 在加载和写入配置文件时进行校验，防止无效配置导致运行时错误。
 */

import { z } from "zod";

const ChatModeSchema = z.enum(["normal", "auto", "plan", "edit"]);

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

export const RAGConfigSchema = z.object({
  enabled: z.boolean().optional(),
  maxResults: z.number().int().positive().optional(),
  chunkSize: z.number().int().positive().optional(),
});

export const TerminalConfigSchema = z.object({
  shell: z.string().min(1, "Shell 不能为空").optional(),
  timeout: z.number().int().positive("超时时间必须大于 0").optional(),
});

export const CostGuardConfigSchema = z.object({
  monthlyBudget: z.number().positive("月预算必须大于 0").optional(),
  warnAtPercent: z.number().min(1, "告警阈值至少为 1").max(100, "告警阈值不能超过 100").optional(),
});

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  model: LLMConfigSchema.optional(),
  models: z.record(LLMConfigSchema).optional(),
  mode: ChatModeSchema.optional(),
  yolo: z.boolean().optional(),
  mcpServers: z.record(MCPServerConfigSchema).optional(),
  rag: RAGConfigSchema.optional(),
  terminal: TerminalConfigSchema.optional(),
  costGuard: CostGuardConfigSchema.optional(),
  systemPrompt: z.string().optional(),
});
