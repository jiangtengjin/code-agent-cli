#!/usr/bin/env node

/**
 * Code Agent CLI - 入口文件
 *
 * 功能：注册所有 CLI 命令并解析命令行参数
 * 用法：
 *   code-agent          进入交互式 TUI 模式（Phase 1b 实现）
 *   code-agent --help   查看帮助
 *   code-agent init     运行配置向导
 *   code-agent config   管理配置
 */

import { createProgram } from "./cli/commands.js";
import { ConfigResolver } from "./config/resolver.js";
import { startChat } from "./cli/chat.js";

// Subcommand routing: no args or unknown subcommand → chat REPL
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const knownCommands = ["init", "config"];

if (args.length > 0 && knownCommands.includes(args[0])) {
  const program = createProgram();
  program.parse();
} else {
  const resolver = new ConfigResolver();
  const cliOptions = createProgram().opts();
  const config = await resolver.resolve(cliOptions);
  await startChat(config);
}
