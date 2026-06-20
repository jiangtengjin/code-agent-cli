/**
 * CLI 命令定义
 *
 * 使用 Commander.js 框架定义 code-agent 的命令树和全局选项。
 * 命令树结构：
 *   code-agent
 *     ├── (默认) → 进入 TUI 交互模式
 *     ├── init   → 配置向导
 *     └── config → 配置管理
 *         ├── set <key> <value>
 *         ├── get <key>
 *         ├── list
 *         └── edit
 */

import { Command } from "commander";
import type { CLIOptions } from "../config/resolver.js";
import { setupWizard } from "../config/wizard.js";
import { debug } from "../utils/logger.js";
import { configEdit, configGet, configList, configSet } from "./config.js";

export function createProgram(): Command {
  const program = new Command();

  // 全局选项和默认行为
  program
    .name("code-agent")
    .description("终端原生编码智能体工具")
    .version("0.1.0")
    .option("-p, --prompt <text>", "非交互模式，直接执行任务")
    .option("-m, --mode <mode>", "指定对话模式")
    .option("--model <model>", "指定模型")
    .option("--yolo", "自主模式，跳过用户确认")
    .option("--debug", "启用调试日志")
    .action(async (options: CLIOptions) => {
      if (options.debug) {
        const { setDebug } = await import("../utils/logger.js");
        setDebug(true);
      }
      const { ConfigResolver } = await import("../config/resolver.js");
      const { startChat } = await import("./chat.js");
      const resolver = new ConfigResolver();
      const config = await resolver.resolve(options);
      await startChat(config);
    });

  // code-agent init — 配置向导
  program
    .command("init")
    .description("在当前项目初始化配置文件")
    .action(async () => {
      await setupWizard();
    });

  // code-agent config — 配置管理
  const configCmd = new Command("config").description("管理配置");

  configCmd
    .command("set")
    .argument("<key>", "配置键")
    .argument("<value>", "配置值")
    .action(configSet);

  configCmd.command("get").argument("<key>", "配置键").action(configGet);

  configCmd.command("list").action(configList);
  configCmd.command("edit").action(configEdit);

  program.addCommand(configCmd);

  return program;
}
