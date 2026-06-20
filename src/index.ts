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

const program = createProgram();
program.parse();
