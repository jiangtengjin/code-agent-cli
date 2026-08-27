/**
 * Markdown Agent 定义加载器
 *
 * Agent 定义为 markdown 文件：frontmatter 是元数据，正文是 system prompt。
 * 选 markdown 而非 JSONC 的原因是 system prompt 是多行自然语言文本，
 * 写在 JSON 字符串里既难读也难 diff。
 *
 * 目录优先级（低到高）：
 *   全局 ~/.config/code-agent/agents/
 *   项目 {cwd}/.code-agent/agents/
 *
 * 同名时高优先级整体覆盖，不做字段级合并——prompt 若被拼接会产生语义歧义。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { AgentDefinition, AgentSource } from "../types/agent.js";
import type { LLMConfig } from "../types/config.js";
import { warn } from "../utils/logger.js";

const AGENTS_DIRNAME = "agents";
const PROJECT_AGENTS_DIR = join(".code-agent", AGENTS_DIRNAME);

/** 默认迭代上限，未在 frontmatter 指定时采用 */
const DEFAULT_MAX_ITERATIONS = 15;

/**
 * 保留名，不允许自定义 agent 占用。
 *
 * 这四个是 ChatMode 的取值。agent 与 mode 虽是正交概念，但同名会让用户
 * 在读日志和写配置时产生混淆，因此禁止。
 */
const RESERVED_AGENT_NAMES = new Set(["normal", "auto", "plan", "edit"]);

/** agent 名允许的字符：小写字母、数字、连字符 */
const VALID_AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function getGlobalAgentsDir(): string {
  return join(homedir(), ".config", "code-agent", AGENTS_DIRNAME);
}

export function getProjectAgentsDir(cwd: string): string {
  return join(cwd, PROJECT_AGENTS_DIR);
}

interface Frontmatter {
  [key: string]: string | number | string[];
}

interface ParsedMarkdown {
  frontmatter: Frontmatter;
  body: string;
}

/**
 * 解析 frontmatter 标量值。
 *
 * 只支持 agent 定义实际需要的三类：内联数组、数字、字符串（可带引号）。
 * 不引入 YAML 依赖——完整 YAML 的能力远超此处所需，且会带来解析歧义。
 */
function parseScalar(raw: string): string | number | string[] {
  const value = raw.trim();

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((entry) => stripQuotes(entry.trim()))
      .filter((entry) => entry.length > 0);
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return stripQuotes(value);
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * 切分 frontmatter 与正文。
 *
 * 缺少 frontmatter 不是错误——正文即 prompt，其余字段走默认值。
 */
function parseMarkdown(content: string): ParsedMarkdown {
  const normalized = content.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: normalized.trim() };
  }

  const closingIndex = normalized.indexOf("\n---", 3);
  if (closingIndex === -1) {
    return { frontmatter: {}, body: normalized.trim() };
  }

  const rawFrontmatter = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + 4).trim();
  const frontmatter: Frontmatter = {};

  for (const line of rawFrontmatter.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);
    if (key) {
      frontmatter[key] = parseScalar(value);
    }
  }

  return { frontmatter, body };
}

function asStringArray(value: string | number | string[] | undefined): string[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return undefined;
}

function asModel(value: string | number | string[] | undefined): string | LLMConfig | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asMaxIterations(value: string | number | string[] | undefined): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return DEFAULT_MAX_ITERATIONS;
}

/**
 * 把单个 markdown 文件解析为 AgentDefinition。
 *
 * 返回 undefined 表示该文件应被跳过，原因已记入警告。
 */
export function parseAgentFile(
  filePath: string,
  content: string,
  source: AgentSource,
): AgentDefinition | undefined {
  const name = basename(filePath).replace(/\.md$/i, "").toLowerCase();

  if (!VALID_AGENT_NAME.test(name)) {
    warn(`跳过 agent 定义 ${filePath}：名称只允许小写字母、数字与连字符`);
    return undefined;
  }

  if (RESERVED_AGENT_NAMES.has(name)) {
    warn(`跳过 agent 定义 ${filePath}：${name} 是保留的模式名`);
    return undefined;
  }

  const { frontmatter, body } = parseMarkdown(content);
  const description = typeof frontmatter.description === "string" ? frontmatter.description : "";

  if (!description) {
    warn(`跳过 agent 定义 ${filePath}：缺少 description，主 agent 无从判断何时委派`);
    return undefined;
  }

  if (!body) {
    warn(`跳过 agent 定义 ${filePath}：正文为空，缺少 system prompt`);
    return undefined;
  }

  return {
    name,
    description,
    systemPrompt: body,
    tools: asStringArray(frontmatter.tools),
    maxIterations: asMaxIterations(frontmatter.maxIterations),
    model: asModel(frontmatter.model),
    source,
  };
}

/** 读取单个目录下的全部 agent 定义。单文件失败不影响其余。 */
function loadAgentsFromDir(dir: string, source: AgentSource): AgentDefinition[] {
  if (!existsSync(dir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(dir).filter((entry) => entry.toLowerCase().endsWith(".md"));
  } catch (error) {
    warn(`读取 agent 目录失败 ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }

  const definitions: AgentDefinition[] = [];

  for (const entry of entries.sort()) {
    const filePath = join(dir, entry);
    try {
      const definition = parseAgentFile(filePath, readFileSync(filePath, "utf-8"), source);
      if (definition) {
        definitions.push(definition);
      }
    } catch (error) {
      warn(
        `解析 agent 定义失败 ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return definitions;
}

/**
 * 按优先级加载全部 agent 定义。
 *
 * 项目级同名定义覆盖全局定义，与 ConfigResolver 的既有优先级一致。
 */
export function loadAgentDefinitions(cwd: string): AgentDefinition[] {
  const byName = new Map<string, AgentDefinition>();

  for (const definition of loadAgentsFromDir(getGlobalAgentsDir(), "global")) {
    byName.set(definition.name, definition);
  }

  for (const definition of loadAgentsFromDir(getProjectAgentsDir(cwd), "project")) {
    byName.set(definition.name, definition);
  }

  return Array.from(byName.values());
}
