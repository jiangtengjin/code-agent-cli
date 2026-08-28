import type { LLMUsage } from "../types/provider.js";
import { formatCost } from "../utils/format.js";

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  currency?: string;
}

export interface CostTrackerOptions {
  monthlyBudget?: number;
  warnAtPercent?: number;
  pricing?: Record<string, ModelPricing>;
}

export interface ModelCostSnapshot extends LLMUsage {
  cost: number;
}

export interface CostSnapshot {
  currency: string;
  totalCost: number;
  byModel: Record<string, ModelCostSnapshot>;
}

/**
 * 内置价格表。
 *
 * 这张表必然滞后于厂商发布——它是硬编码的，而厂商随时上新模型。用未收录的
 * 模型时 record() 仍会累计 token 并告警一次，而非静默跳过；准确的价格应由
 * 用户通过 costGuard.pricing 补充，因为 /models 端点不返回价格信息。
 *
 * glm-4 保留在表中仅为兼容旧配置，GLM 当前可用列表已从 glm-4.5 起步。
 */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // Official DeepSeek V4 list prices (cache miss) as of 2026-07-25.
  "deepseek-v4-flash": { inputPerMillion: 1, outputPerMillion: 2, currency: "¥" },
  "deepseek-v4-pro": { inputPerMillion: 3, outputPerMillion: 6, currency: "¥" },
  "deepseek-coder": { inputPerMillion: 2, outputPerMillion: 8, currency: "¥" },
  "deepseek-chat": { inputPerMillion: 1, outputPerMillion: 2, currency: "¥" },
  "deepseek-reasoner": { inputPerMillion: 1, outputPerMillion: 2, currency: "¥" },
  "qwen-plus": { inputPerMillion: 4, outputPerMillion: 12, currency: "¥" },
  "glm-4": { inputPerMillion: 5, outputPerMillion: 15, currency: "¥" },
  "moonshot-v1-8k": { inputPerMillion: 12, outputPerMillion: 12, currency: "¥" },
  kimi: { inputPerMillion: 12, outputPerMillion: 12, currency: "¥" },
};

export class CostTracker {
  private readonly pricing: Record<string, ModelPricing>;
  private readonly totals: CostSnapshot;
  private warned = false;
  private readonly unpricedModels = new Set<string>();

  constructor(
    private readonly options: CostTrackerOptions = {},
    initialSnapshot?: CostSnapshot,
  ) {
    this.pricing = { ...DEFAULT_PRICING, ...(options.pricing ?? {}) };
    this.totals = {
      currency: "¥",
      totalCost: 0,
      byModel: {},
    };
    this.restore(initialSnapshot);
  }

  record(modelName: string, usage: LLMUsage | undefined): string | undefined {
    if (!usage) return undefined;

    const pricing = this.pricing[modelName];

    // 未知模型仍要累计 token：价格表必然滞后于厂商发布（写死 glm-4 时厂商已到
    // glm-5.3），若直接跳过，/status 面板会显示 0 用量，用户以为没花钱。
    // 费用记 0 并首次告警一次，让「无法估算」变成可见事实而非静默假象。
    if (!pricing) {
      this.accumulate(modelName, usage, 0);

      if (!this.unpricedModels.has(modelName)) {
        this.unpricedModels.add(modelName);
        return `模型 ${modelName} 缺少价格配置，token 已计入但费用无法估算${
          this.options.monthlyBudget ? "，预算告警对该模型不生效" : ""
        }。可在配置的 costGuard.pricing 中补充。`;
      }

      return undefined;
    }

    const cost =
      (usage.promptTokens / 1_000_000) * pricing.inputPerMillion +
      (usage.completionTokens / 1_000_000) * pricing.outputPerMillion;

    this.totals.currency = pricing.currency ?? this.totals.currency;
    this.accumulate(modelName, usage, cost);

    if (
      !this.warned &&
      this.options.monthlyBudget &&
      this.options.warnAtPercent &&
      this.totals.totalCost >= this.options.monthlyBudget * (this.options.warnAtPercent / 100)
    ) {
      this.warned = true;
      return `预算告警：当前估算费用 ${formatCost(this.totals.totalCost, this.totals.currency)} 已达到月预算 ${this.options.warnAtPercent}%`;
    }

    return undefined;
  }

  /** 累计单个模型的 token 与费用 */
  private accumulate(modelName: string, usage: LLMUsage, cost: number): void {
    this.totals.totalCost += cost;

    const current = this.totals.byModel[modelName] ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
    };

    current.promptTokens += usage.promptTokens;
    current.completionTokens += usage.completionTokens;
    current.totalTokens += usage.totalTokens;
    current.cost += cost;
    this.totals.byModel[modelName] = current;
  }

  /** 已知缺少价格配置的模型，用于避免重复告警 */
  hasUnpricedModels(): boolean {
    return this.unpricedModels.size > 0;
  }

  snapshot(): CostSnapshot {
    return {
      currency: this.totals.currency,
      totalCost: this.totals.totalCost,
      byModel: { ...this.totals.byModel },
    };
  }

  restore(snapshot?: CostSnapshot): void {
    if (!snapshot) {
      this.reset();
      return;
    }

    this.totals.currency = snapshot.currency;
    this.totals.totalCost = snapshot.totalCost;
    this.totals.byModel = Object.fromEntries(
      Object.entries(snapshot.byModel).map(([modelName, usage]) => [modelName, { ...usage }]),
    );
    this.warned = this.hasReachedWarningThreshold();
  }

  reset(): void {
    this.totals.currency = "¥";
    this.totals.totalCost = 0;
    this.totals.byModel = {};
    this.warned = false;
  }

  private hasReachedWarningThreshold(): boolean {
    if (!this.options.monthlyBudget || !this.options.warnAtPercent) {
      return false;
    }

    return this.totals.totalCost >= this.options.monthlyBudget * (this.options.warnAtPercent / 100);
  }
}

export function formatCostSnapshot(snapshot: CostSnapshot): string {
  const lines = ["Cost usage", `Total cost: ${formatCost(snapshot.totalCost, snapshot.currency)}`];

  for (const [modelName, usage] of Object.entries(snapshot.byModel)) {
    lines.push(
      `${modelName}: ${usage.totalTokens} tokens, ${formatCost(usage.cost, snapshot.currency)}`,
    );
  }

  return lines.join("\n");
}
