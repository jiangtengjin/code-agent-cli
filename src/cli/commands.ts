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
import { mcpAdd, mcpList, mcpRemove } from "./mcp.js";

export function createProgram(): Command {
  const program = new Command();
  program.enablePositionalOptions();

  // 全局选项和默认行为
  program
    .name("code-agent")
    .description("终端原生编码智能体工具")
    .version("0.1.0")
    .option("-p, --prompt <text>", "非交互模式，直接执行任务")
    .option("--continue", "恢复当前工作区最近一次会话")
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
      const { runPrompt, startChat } = await import("./chat.js");
      const resolver = new ConfigResolver();
      const config = await resolver.resolve(options);
      if (options.prompt) {
        await runPrompt(config, options.prompt);
        return;
      }
      await startChat(config, {
        continueLast: Boolean(options.continue),
      });
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

  const mcpCmd = new Command("mcp").description("管理 MCP 服务");
  mcpCmd.enablePositionalOptions();

  mcpCmd
    .command("add")
    .description("添加 MCP 服务")
    .argument("<name>", "服务名称")
    .argument("<command>", "启动命令")
    .argument("[args...]", "命令参数")
    .option("--transport <transport>", "传输协议", "stdio")
    .option("--url <url>", "SSE/HTTP 服务地址")
    .option("--env <entry...>", "环境变量，格式 KEY=VALUE")
    .passThroughOptions()
    .addHelpText(
      "after",
      [
        "",
        "提示:",
        "  <command> 后的选项会原样透传给 MCP 服务进程。",
        "  如果要使用 mcp add 自身的 --transport/--url/--env 选项，请放在 <name> 之前。",
      ].join("\n"),
    )
    .action(mcpAdd);

  mcpCmd.command("remove").argument("<name>", "服务名称").action(mcpRemove);
  mcpCmd.command("list").action(mcpList);

  program.addCommand(mcpCmd);

  program
    .command("resume")
    .description("恢复历史会话")
    .argument("[query]", "会话 ID 或标题前缀")
    .option("--last", "恢复当前工作区最近一次会话")
    .option("--all", "跨工作区检索")
    .action(async (query: string | undefined, options: { last?: boolean; all?: boolean }) => {
      const { ConfigResolver } = await import("../config/resolver.js");
      const { startChat } = await import("./chat.js");
      const resolver = new ConfigResolver();
      const config = await resolver.resolve({});

      await startChat(config, {
        continueLast: false,
        resumeLast: Boolean(options.last || !query),
        resumeAll: Boolean(options.all),
        resumeQuery: query,
      });
    });

  return program;
}
