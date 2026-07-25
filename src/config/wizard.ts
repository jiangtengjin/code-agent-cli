/**
 * 配置向导
 *
 * code-agent init 引导式配置流程：
 *   1. 选择模型厂商
 *   2. 输入 API Key
 *   3. 选择默认对话模式
 *   4. 自动写入全局配置文件
 *
 * 支持五个厂商预设：DeepSeek / Qwen / GLM / Ollama / 手动配置
 */

import chalk from "chalk";
import type { Config } from "../types/config.js";
import { getGlobalConfigPath, writeConfigFile } from "./manager.js";

/** 从标准输入读取一行文本 */
async function promptInput(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once("data", (data) => {
      resolve(data.toString().trim());
    });
  });
}

/** 交互式选择列表 */
async function promptSelect(options: {
  message: string;
  options: { value: string; label: string; hint: string }[];
}): Promise<string> {
  console.log(chalk.dim(options.message));
  for (let i = 0; i < options.options.length; i++) {
    const opt = options.options[i];
    const isRecommended = opt.label.includes("推荐");
    const label = isRecommended ? `${opt.label} ${chalk.bold(chalk.yellow("[推荐]"))}` : opt.label;
    console.log(`  ${chalk.cyan(`${i + 1}.`)} ${label}`);
    console.log(`     ${chalk.dim(opt.hint)}`);
  }
  const answer = await promptInput(chalk.dim("  输入编号 (1-5): "));
  const index = Number.parseInt(answer) - 1;
  if (index >= 0 && index < options.options.length) {
    return options.options[index].value;
  }
  console.log(chalk.yellow("  使用默认选项"));
  return options.options[0].value;
}

/** 根据厂商返回推荐的模型名称 */
function getDefaultModel(provider: string): string {
  const models: Record<string, string> = {
    deepseek: "deepseek-v4-flash",
    qwen: "qwen-plus",
    glm: "glm-4",
    ollama: "qwen2.5-coder:7b",
  };
  return models[provider] || "deepseek-v4-flash";
}

/** 根据厂商返回默认 API Base URL */
function getDefaultBaseUrl(provider: string): string | undefined {
  const urls: Record<string, string> = {
    deepseek: "https://api.deepseek.com/v1",
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    glm: "https://open.bigmodel.cn/api/paas/v4",
    ollama: "http://localhost:11434/v1",
  };
  return urls[provider];
}

/** 启动交互式配置向导 */
export async function setupWizard(): Promise<void> {
  console.log();
  console.log(`  ${chalk.bold("╭──────────────────────────────╮")}`);
  console.log(
    `  ${chalk.bold("│")}  ${chalk.cyan("Code Agent - 配置向导")}       ${chalk.bold("│")}`,
  );
  console.log(
    `  ${chalk.bold("│")}  ${chalk.dim("1 分钟上手，开始编码智能体之旅")}  ${chalk.bold("│")}`,
  );
  console.log(`  ${chalk.bold("╰──────────────────────────────╯")}`);
  console.log();

  // Step 1: 选择模型厂商
  const provider = await promptSelect({
    message: "选择模型厂商：",
    options: [
      {
        value: "deepseek",
        label: "DeepSeek",
        hint: "代码能力强，性价比高",
      },
      {
        value: "qwen",
        label: "阿里 Qwen",
        hint: "通义千问，推理能力强",
      },
      {
        value: "glm",
        label: "智谱 GLM",
        hint: "CodeGeeX 代码模型",
      },
      {
        value: "ollama",
        label: "Ollama (本地)",
        hint: "数据不出本机，免费使用",
      },
      {
        value: "custom",
        label: "手动配置",
        hint: "自定义 API 地址和模型",
      },
    ],
  });

  // Step 2: 输入 API Key
  let apiKey = "";
  let baseUrl: string | undefined;

  if (provider === "custom") {
    apiKey = await promptInput(chalk.dim("输入 API Key: "));
    baseUrl = await promptInput(chalk.dim("输入 API Base URL: "));
  } else if (provider !== "ollama") {
    apiKey = await promptInput(chalk.dim("输入 API Key（留空则通过环境变量配置）: "));
    baseUrl = getDefaultBaseUrl(provider);
  }

  // Step 3: 确认是否启用自主模式
  const isYolo = await promptInput(chalk.dim("启用 --yolo 自主模式（跳过用户确认）？(y/N): "));
  const yolo = isYolo.toLowerCase() === "y" || isYolo.toLowerCase() === "yes";

  // 写入配置文件
  const config: Config = {
    model: {
      provider,
      model: getDefaultModel(provider),
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    },
    mode: "normal",
    yolo,
    mcpServers: {},
  };

  writeConfigFile(getGlobalConfigPath(), config);
  console.log();
  console.log(chalk.green("✅ 配置完成！运行 code-agent 开始使用"));
}
