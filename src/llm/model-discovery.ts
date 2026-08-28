/**
 * 模型发现
 *
 * 通过 OpenAI 兼容的 GET /models 端点拉取厂商当前可用的模型列表，替代硬编码。
 * 硬编码的问题是它必然过时：代码里写死 glm-4 时，厂商已经上线到 glm-5.3。
 *
 * 并非所有厂商都实现该端点，因此所有失败都降级为「拿不到列表」而非抛错——
 * 调用方应回退到手动输入，不能让配置流程卡死。
 */

import type { LLMConfig } from "../types/config.js";

/** 单个可用模型 */
export interface DiscoveredModel {
  id: string;
  /** 发布时间，用于把新模型排在前面 */
  created?: number;
  ownedBy?: string;
}

export type ModelDiscoveryFailure =
  | "unauthorized"
  | "unsupported"
  | "network"
  | "malformed"
  | "missing_base_url";

export interface ModelDiscoveryResult {
  models: DiscoveredModel[];
  /** 失败原因，成功时为 undefined */
  failure?: ModelDiscoveryFailure;
  /** 面向用户的可诊断说明 */
  message?: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

function describeFailure(failure: ModelDiscoveryFailure, detail?: string): string {
  switch (failure) {
    case "unauthorized":
      return "API Key 无效或无权访问模型列表";
    case "unsupported":
      return "该厂商不支持 /models 接口，请手动输入模型名";
    case "network":
      return `无法连接到 API：${detail ?? "网络错误"}`;
    case "malformed":
      return "模型列表格式无法识别，请手动输入模型名";
    case "missing_base_url":
      return "缺少 API 地址，无法查询模型列表";
  }
}

/**
 * 拉取可用模型列表。
 *
 * 返回结果而非抛错：配置向导需要在拿不到列表时平滑回退到手动输入。
 */
export async function fetchAvailableModels(
  config: Pick<LLMConfig, "baseUrl" | "apiKey">,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ModelDiscoveryResult> {
  const baseUrl = config.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    return {
      models: [],
      failure: "missing_base_url",
      message: describeFailure("missing_base_url"),
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutSignal =
    options.signal ??
    (typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      : undefined);

  let response: Response;
  try {
    response = await doFetch(`${baseUrl}/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: timeoutSignal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { models: [], failure: "network", message: describeFailure("network", detail) };
  }

  if (response.status === 401 || response.status === 403) {
    return { models: [], failure: "unauthorized", message: describeFailure("unauthorized") };
  }

  if (!response.ok) {
    // 404/405 是「不支持该端点」，其余非 2xx 也无法产出列表，一并按不支持处理
    return { models: [], failure: "unsupported", message: describeFailure("unsupported") };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { models: [], failure: "malformed", message: describeFailure("malformed") };
  }

  const models = parseModelList(payload);
  if (models.length === 0) {
    return { models: [], failure: "malformed", message: describeFailure("malformed") };
  }

  return { models };
}

/** 解析 OpenAI 标准的 { object: "list", data: [{ id, created, owned_by }] } */
function parseModelList(payload: unknown): DiscoveredModel[] {
  if (!payload || typeof payload !== "object") return [];

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const models: DiscoveredModel[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { id?: unknown; created?: unknown; owned_by?: unknown };
    if (typeof record.id !== "string" || !record.id) continue;

    models.push({
      id: record.id,
      created: typeof record.created === "number" ? record.created : undefined,
      ownedBy: typeof record.owned_by === "string" ? record.owned_by : undefined,
    });
  }

  return sortByRecencyThenName(models);
}

/**
 * 新模型排前面。
 *
 * 用户通常想用最新的那个，而厂商返回的顺序不保证。created 缺失时退回名称排序，
 * 保证结果稳定。
 */
function sortByRecencyThenName(models: DiscoveredModel[]): DiscoveredModel[] {
  return [...models].sort((left, right) => {
    if (
      left.created !== undefined &&
      right.created !== undefined &&
      left.created !== right.created
    ) {
      return right.created - left.created;
    }
    if (left.created !== undefined && right.created === undefined) return -1;
    if (left.created === undefined && right.created !== undefined) return 1;
    return left.id.localeCompare(right.id);
  });
}
