/**
 * CLI command definitions.
 */

import { Command } from "commander";
import type { CLIOptions } from "../config/resolver.js";
import { setupWizard } from "../config/wizard.js";
import type { StartInteractiveShellOptions } from "../tui/bootstrap.js";
import type { Config } from "../types/config.js";
import { configEdit, configGet, configList, configSet } from "./config.js";
import { mcpAdd, mcpList, mcpRemove } from "./mcp.js";
import { parseCLIOptions } from "./options.js";

type ResumeCommandOptions = {
  last?: boolean;
  all?: boolean;
  fork?: boolean;
};

function isInteractiveTerminal(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

function getGlobalCLIOptions(command: Command): CLIOptions {
  return parseCLIOptions(command.optsWithGlobals());
}

function buildShellStartOptions(
  cliOptions: Pick<CLIOptions, "plainUi" | "noAltScreen">,
  overrides: Partial<StartInteractiveShellOptions> = {},
): StartInteractiveShellOptions | undefined {
  const startOptions: StartInteractiveShellOptions = { ...overrides };

  if (cliOptions.plainUi) {
    startOptions.plainUi = true;
  }

  if (cliOptions.noAltScreen) {
    startOptions.noAltScreen = true;
  }

  return Object.keys(startOptions).length > 0 ? startOptions : undefined;
}

function buildResumeShellOptions(
  query: string | undefined,
  options: ResumeCommandOptions,
): StartInteractiveShellOptions {
  if (!options.last && !query) {
    const startOptions: StartInteractiveShellOptions = {
      initialScene: "resume",
      resumePicker: true,
    };

    if (options.all) {
      startOptions.resumeAll = true;
    }

    if (options.fork) {
      startOptions.resumeFork = true;
    }

    return startOptions;
  }

  const startOptions: StartInteractiveShellOptions = {
    initialScene: "chat",
  };

  if (options.last) {
    startOptions.resumeLast = true;
  }

  if (options.all) {
    startOptions.resumeAll = true;
  }

  if (query) {
    startOptions.resumeQuery = query;
  }

  if (options.fork) {
    startOptions.resumeFork = true;
  }

  return startOptions;
}

async function setDebugIfEnabled(options: CLIOptions): Promise<void> {
  if (!options.debug) {
    return;
  }

  const { setDebug } = await import("../utils/logger.js");
  setDebug(true);
}

async function resolveConfig(options: CLIOptions): Promise<Config> {
  const { ConfigResolver } = await import("../config/resolver.js");
  const resolver = new ConfigResolver();
  return resolver.resolve(options);
}

async function startShell(config: Config, options?: StartInteractiveShellOptions): Promise<void> {
  const { startInteractiveShell } = await import("../tui/bootstrap.js");

  if (options) {
    await startInteractiveShell(config, options);
    return;
  }

  await startInteractiveShell(config);
}

async function resolveAndStartShell(
  cliOptions: CLIOptions,
  overrides: Partial<StartInteractiveShellOptions> = {},
): Promise<void> {
  const config = await resolveConfig(cliOptions);
  const startOptions = buildShellStartOptions(cliOptions, overrides);
  await startShell(config, startOptions);
}

export function createProgram(): Command {
  const program = new Command();
  program.enablePositionalOptions();

  program
    .name("code-agent")
    .description("终端原生编码智能体工具")
    .version("0.1.0")
    .option("-p, --prompt <text>", "非交互模式，直接执行任务")
    .option("--continue", "恢复当前工作区最近一次会话")
    .option("--plain-ui", "强制使用纯文本界面")
    .option("--no-alt-screen", "禁用 alternate screen rendering")
    .option("-m, --mode <mode>", "指定对话模式")
    .option("--model <model>", "指定模型")
    .option("--yolo", "自主模式，跳过用户确认")
    .option("--debug", "启用调试日志")
    .action(async function (this: Command, rawOptions: Record<string, unknown>) {
      const options = parseCLIOptions(rawOptions);
      await setDebugIfEnabled(options);
      const config = await resolveConfig(options);
      const { runPrompt } = await import("./chat.js");

      if (options.prompt) {
        await runPrompt(config, options.prompt);
        return;
      }

      const startOptions = buildShellStartOptions(
        options,
        options.continue
          ? {
              continueLast: true,
              initialScene: "chat",
            }
          : {},
      );
      await startShell(config, startOptions);
    });

  program
    .command("init")
    .description("在当前项目初始化配置文件")
    .action(async function (this: Command) {
      const options = getGlobalCLIOptions(this);
      await setDebugIfEnabled(options);

      if (isInteractiveTerminal()) {
        await resolveAndStartShell(options, {
          initialScene: "settings",
        });
        return;
      }

      await setupWizard();
    });

  const configCmd = new Command("config").description("管理配置");

  configCmd
    .command("set")
    .argument("<key>", "配置键")
    .argument("<value>", "配置值")
    .action(configSet);

  configCmd.command("get").argument("<key>", "配置键").action(configGet);
  configCmd.command("list").action(configList);
  configCmd.command("edit").action(configEdit);
  configCmd.action(async function (this: Command) {
    const options = getGlobalCLIOptions(this);
    await setDebugIfEnabled(options);

    if (isInteractiveTerminal()) {
      await resolveAndStartShell(options, {
        initialScene: "settings",
      });
      return;
    }

    configList();
  });

  program.addCommand(configCmd);

  const mcpCmd = new Command("mcp").description("管理 MCP 服务");
  mcpCmd.enablePositionalOptions();
  mcpCmd.action(async function (this: Command) {
    const options = getGlobalCLIOptions(this);
    await setDebugIfEnabled(options);

    if (isInteractiveTerminal()) {
      await resolveAndStartShell(options, {
        initialScene: "mcp",
      });
      return;
    }

    mcpList();
  });

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
        "提示：",
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
    .argument("[query]", "会话编号或标题前缀")
    .option("--last", "恢复当前工作区最近一次会话")
    .option("--all", "跨工作区检索")
    .option("--fork", "基于目标会话派生新会话，而不是直接恢复原会话")
    .action(async function (
      this: Command,
      query: string | undefined,
      options: ResumeCommandOptions,
    ) {
      const cliOptions = getGlobalCLIOptions(this);
      await setDebugIfEnabled(cliOptions);
      const { startChat } = await import("./chat.js");
      const config = await resolveConfig(cliOptions);

      if (isInteractiveTerminal()) {
        const startOptions = buildShellStartOptions(
          cliOptions,
          buildResumeShellOptions(query, options),
        );
        await startShell(config, startOptions);
        return;
      }

      const useSelector = !options.last && !query;
      await startChat(config, {
        continueLast: false,
        resumeLast: Boolean(options.last),
        resumeAll: Boolean(options.all),
        resumeQuery: query,
        resumePicker: useSelector,
        resumeFork: Boolean(options.fork),
      });
    });

  return program;
}
