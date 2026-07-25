import type { Config, LLMConfig } from "../types/config.js";
import type { LLMMessage } from "../types/provider.js";
import { createProviderForModelConfig } from "./provider-factory.js";
import type { ChatParams, LLMProvider } from "./provider.js";

type TaskType = "codegen" | "refactor" | "analysis" | "debug" | "general";

function getLatestUserPrompt(messages: LLMMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }

  return "";
}

export class ModelRouter {
  route(task: string, config: Config): LLMConfig {
    if (!config.models || Object.keys(config.models).length === 0) {
      if (!config.model) {
        throw new Error("Model not configured");
      }
      return config.model;
    }

    const taskType = this.classifyTask(task);
    const targetAlias =
      taskType === "codegen" || taskType === "refactor"
        ? "code"
        : taskType === "analysis" || taskType === "debug"
          ? "reason"
          : "fast";

    const routedModel = config.models[targetAlias] ?? config.models.default ?? config.model;
    if (!routedModel) {
      throw new Error("Model not configured");
    }

    return routedModel;
  }

  classifyTask(task: string): TaskType {
    if (/生成|创建|写|实现|开发|新增/i.test(task)) return "codegen";
    if (/改|重构|优化|调整/i.test(task)) return "refactor";
    if (/读|解|释|分析|查|找|总结/i.test(task)) return "analysis";
    if (/bug|错|修|调|试|修复/i.test(task)) return "debug";
    return "general";
  }
}

export class RoutedLLMProvider implements LLMProvider {
  readonly name = "model-router";

  constructor(
    private readonly config: Config,
    private readonly router = new ModelRouter(),
  ) {}

  async chat(params: ChatParams) {
    const task = getLatestUserPrompt(params.messages);
    const provider = createProviderForModelConfig(this.router.route(task, this.config));
    return provider.chat(params);
  }
}
