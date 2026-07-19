# Code Agent CLI

Code Agent CLI 是一个终端原生的 AI 编码智能体工具。它把本地代码仓库、文件工具、搜索工具和 MCP 外部工具接入到大模型，让模型可以在终端里理解任务、搜索代码、读取文件、修改文件，并在需要时通过工具调用完成多步骤编码任务。

一句话概括：这是一个面向本地工程仓库的命令行编码助手，目标是用可配置、可扩展、可审计的方式，把 LLM 变成能真正操作项目的开发协作者。

本文档按项目一期完整产品方案描述，重点展示一期要交付的完整能力闭环，而不是按实现进度逐项拆分。

完整设计背景见 [docs/方案设计文档.md](docs/方案设计文档.md)。

## 适合解决什么问题

- 理解陌生项目：快速梳理目录结构、模块职责、关键入口和调用关系。
- 定位代码问题：通过 `glob_search`、`grep_search` 和文件读取工具查找相关实现。
- 小范围代码修改：让模型读取上下文后执行 `create_file`、`write_file`、`edit_file`、`delete_file` 等文件操作。
- 多步骤工程任务：在 Auto 模式下让模型连续执行“分析 -> 调工具 -> 继续分析 -> 再调工具”的循环。
- 接入外部能力：通过 MCP Server 把外部工具统一注册为模型可调用工具。
- 团队内部 CLI 原型：作为 TypeScript + Node.js 实现编码 Agent 的骨架项目，便于继续扩展模型、工具、模式和安全策略。

## 一期完整内容

一期目标是跑通“配置模型 -> 进入终端会话 -> 理解任务 -> 搜索/读取代码 -> 调用工具修改文件 -> 返回结果与统计”的核心闭环。它不是单纯的聊天 CLI，而是一个具备工具执行、模式切换、安全确认和 MCP 扩展能力的编码 Agent MVP。

| 模块 | 一期内容 | 用户价值 |
| --- | --- | --- |
| 项目骨架 | TypeScript、Node.js 20+、pnpm、tsup、Vitest、Biome | 提供可维护、可测试、可持续迭代的 CLI 工程基础 |
| CLI 入口 | `code-agent` 主入口、`init` 配置向导、`config` 配置管理、`--help`、`--version` | 用户可以快速安装、初始化、查看和修改配置 |
| 交互体验 | 终端聊天界面、欢迎信息、输入框、工具调用展示、状态信息、Slash 命令 | 用户在终端内完成完整编码对话，不需要切换应用 |
| 非交互任务 | `--prompt` 单次任务执行 | 支持脚本化、自动化和 CI 场景中的一次性 Agent 调用 |
| 配置系统 | 全局配置、项目配置、环境变量、CLI 参数优先级合并 | 同时满足个人默认配置、项目定制配置和临时覆盖 |
| LLM 接入 | 统一 Provider 接口、OpenAI-compatible Adapter、DeepSeek/Qwen/GLM/Ollama/custom 兼容 | 通过一套接口接入主流模型和私有兼容端点 |
| 工具系统 | ToolRegistry、工具定义、工具执行结果、Tool Calling 循环 | 让模型能把“想做什么”转成真实的文件与搜索操作 |
| 文件工具 | `read_file`、`write_file`、`edit_file`、`create_file`、`delete_file`、`list_dir` | 支持理解、创建、修改和清理项目文件 |
| 搜索工具 | `glob_search`、`grep_search` | 支持快速定位文件、符号、配置、调用点和错误线索 |
| Normal 模式 | 标准问答 + 按需调工具 | 适合日常解释、定位、小范围修改和用户参与式编码 |
| Auto 模式 | 多轮 LLM + 工具调用循环，带最大迭代限制 | 适合较完整的分析、修改、验证类任务 |
| Slash 命令 | `/mode`、`/model`、`/clear`、`/help`、`/usage`、`/exit` 及常用别名 | 会话内快速切换模式、查看状态、清空上下文和退出 |
| MCP 扩展 | stdio MCP Server 管理、工具自动发现、工具注册、工具调用、关闭清理 | 把文件系统、数据库、浏览器、内部平台等外部能力接入 Agent |
| 安全机制 | 写文件/删文件/敏感路径确认、`--yolo` 自主模式、API Key 掩码 | 在效率和安全之间提供明确选择 |
| 可观测信息 | token 使用、任务耗时、工具耗时、迭代次数 | 让用户知道一次任务花了多少上下文、时间和工具步骤 |

## 一期阶段拆分

一期按四个阶段推进，每个阶段都能独立验证，最终组成完整 MVP。

| 阶段 | 目标 | 核心交付 |
| --- | --- | --- |
| Phase 1a：项目骨架 + 核心 CLI | 搭好工程基础，跑通命令入口 | TypeScript 项目、Commander CLI、配置读写、`init`、`config`、`--help`、`--version` |
| Phase 1b：LLM 接入 + 基本对话 | 能在终端和模型对话 | LLM Provider 接口、OpenAI 兼容适配器、DeepSeek-Coder 首个模型、基础聊天界面 |
| Phase 1c：工具系统 + 文件读写 | 让 AI 能读取和编辑项目文件 | ToolRegistry、文件工具、搜索工具、Tool Calling、工具确认、`--yolo`、工具调用展示 |
| Phase 1d：Normal + Auto + MCP | 跑通核心业务闭环 | ModeRouter、Normal、Auto、Slash 命令、MCP stdio 管理、MCP 工具自动发现、端到端流程 |

## 快速开始

项目使用 TypeScript、Node.js 20+ 和 tsup 构建。推荐使用 pnpm。

```bash
pnpm install
pnpm build
node dist/index.js --help
```

初始化全局配置：

```bash
node dist/index.js init
```

启动交互式会话：

```bash
node dist/index.js
```

执行一次性任务：

```bash
node dist/index.js --prompt "帮我总结 src 目录的模块结构"
```

指定模式或模型：

```bash
node dist/index.js --mode auto --prompt "检查工具系统还有哪些测试缺口"
node dist/index.js --model deepseek-coder
```

跳过工具确认：

```bash
node dist/index.js --mode auto --yolo --prompt "修复当前测试失败"
```

注意：`--yolo` 会跳过文件修改等工具确认，只建议在干净工作区或可回滚场景使用。

如果已通过包管理器安装或 `npm link` 暴露了 bin，也可以直接使用：

```bash
code-agent
code-agent init
code-agent config list
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `code-agent` | 进入交互式聊天 |
| `code-agent -p, --prompt <text>` | 非交互执行单次任务 |
| `code-agent -m, --mode <mode>` | 指定默认模式 |
| `code-agent --model <model>` | 临时覆盖模型名称 |
| `code-agent --yolo` | 跳过工具执行确认 |
| `code-agent --debug` | 输出调试日志 |
| `code-agent init` | 创建全局配置 |
| `code-agent config list` | 查看全局配置 |
| `code-agent config get <key>` | 读取配置项，支持点号路径 |
| `code-agent config set <key> <value>` | 写入配置项，支持点号路径 |
| `code-agent config edit` | 输出全局配置文件路径，供手动编辑 |

交互式会话内支持 Slash 命令：

| Slash 命令 | 别名 | 作用 |
| --- | --- | --- |
| `/help` | `/?`, `/h` | 查看命令 |
| `/model` | `/llm` | 查看当前模型 |
| `/mode <mode>` | - | 切换模式，一期重点支持 `normal` 和 `auto` |
| `/clear` | `/cls` | 清空对话历史 |
| `/usage` | `/tokens` | 查看 token 使用 |
| `/exit` | `/quit`, `/q` | 退出 |

交互时输入 `/` 会出现命令建议，`Tab` 可补全 Slash 命令，`Ctrl+T` 可循环切换模式标签。

## 配置说明

配置文件使用 JSONC 思路设计，读写采用 JSON 兼容格式。

配置来源优先级：

```text
CLI 参数 (--model, --mode, --yolo)
  > 环境变量 CODE_AGENT_*
  > 当前工作目录的 .code-agent.jsonc
  > 全局配置 ~/.config/code-agent/config.jsonc
```

全局配置由 `code-agent init` 创建。`code-agent config` 系列命令只操作全局配置。

支持的环境变量：

| 环境变量 | 作用 |
| --- | --- |
| `CODE_AGENT_PROVIDER` | 模型厂商，例如 `deepseek`、`qwen`、`glm`、`ollama`、`custom` |
| `CODE_AGENT_MODEL` | 模型名称 |
| `CODE_AGENT_API_KEY` | API Key |
| `CODE_AGENT_BASE_URL` | OpenAI-compatible API 地址 |
| `CODE_AGENT_MODE` | 默认模式，例如 `normal` 或 `auto` |
| `CODE_AGENT_YOLO` | 设置为 `true` 时跳过确认 |

项目级配置示例：

```jsonc
{
  "model": {
    "provider": "deepseek",
    "model": "deepseek-coder",
    "apiKey": "sk-xxx",
    "baseUrl": "https://api.deepseek.com/v1"
  },
  "mode": "normal",
  "yolo": false,
  "systemPrompt": "你是一个谨慎的编码助手，修改文件前先读取上下文。",
  "mcpServers": {}
}
```

更推荐把密钥放在环境变量中：

```powershell
$env:CODE_AGENT_PROVIDER="deepseek"
$env:CODE_AGENT_MODEL="deepseek-coder"
$env:CODE_AGENT_API_KEY="sk-xxx"
$env:CODE_AGENT_BASE_URL="https://api.deepseek.com/v1"
```

## MCP 配置

MCP 用于把外部工具以统一协议接入 Agent。MCP 接入使用官方 `@modelcontextprotocol/sdk`，一期优先支持 stdio transport。

示例：

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "transport": "stdio"
    }
  }
}
```

启动聊天时，`MCPServerManager` 会：

1. 按配置启动 stdio MCP Server。
2. 调用 `listTools()` 自动发现工具。
3. 把 MCP 工具注册到内部 `ToolRegistry`。
4. 模型调用时转发到对应 MCP Server。
5. 会话结束或异常时关闭已启动的 MCP Server，并清理注册过的工具。

MCP 工具在内部会被命名为：

```text
mcp_<serverName>_<toolName>
```

例如 `filesystem/read_file` 可能注册为 `mcp_filesystem_read_file`。

## 内置工具

一期默认工具注册表包含：

| 工具 | 作用 |
| --- | --- |
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件内容 |
| `edit_file` | 基于搜索替换编辑文件 |
| `create_file` | 创建新文件 |
| `delete_file` | 删除文件 |
| `list_dir` | 列出目录内容，支持递归深度和模式过滤 |
| `glob_search` | 用 glob 模式搜索文件 |
| `grep_search` | 在文件中按正则搜索文本 |

文件修改类工具会触发确认；检测到 `.env`、密钥、证书、凭据、`.ssh`、`.aws` 等敏感路径时会额外提示。使用 `--yolo` 会跳过确认。

## 核心执行流程

```text
用户输入
  -> ConfigResolver 合并配置
  -> 创建 LLM Provider
  -> 创建内置 ToolRegistry
  -> 启动 MCP Server 并注册 MCP 工具
  -> ModeRouter 选择 Normal / Auto 处理器
  -> LLM 请求，携带消息、systemPrompt、工具定义
  -> 如果模型返回 tool_calls，执行工具并写回 tool 消息
  -> 继续循环，直到模型返回最终文本或达到最大轮数
  -> 输出回复、token 使用和耗时
```

Normal 和 Auto 共用同一套执行循环，差异主要是最大迭代次数：

| 模式 | 一期定位 |
| --- | --- |
| `normal` | 标准问答 + 按需调工具，适合分析和小范围修改 |
| `auto` | 多轮 LLM + 工具调用循环，适合连续搜索、修改、验证 |

## 项目结构

一期目标结构如下：

```text
code-agent-cli/
├── src/
│   ├── index.ts                  # CLI 入口
│   ├── types/                    # Config、Provider、Tool、Mode、MCP 等类型定义
│   ├── cli/                      # Commander 命令、全局选项、init/config 子命令
│   ├── tui/                      # 终端交互层：聊天视图、输入框、状态栏、工具调用展示
│   ├── engine/                   # 会话管理、上下文管理、模式路由、执行循环
│   ├── tools/
│   │   ├── registry.ts           # 工具注册中心
│   │   ├── built-in/             # 文件、搜索、终端、Web 等内置工具
│   │   └── mcp/                  # MCP Client、MCP Server Manager、传输层封装
│   ├── llm/                      # LLM Provider 接口、模型适配器、模型路由、成本追踪
│   ├── config/                   # 配置读写、配置解析、配置向导、Schema
│   └── utils/                    # 日志、路径安全、格式化、确认、API Key 掩码
├── tests/
│   ├── unit/                     # 单元测试
│   ├── integration/              # 集成测试
│   └── e2e/                      # 端到端场景测试
├── docs/
│   ├── 需求分析文档.md
│   ├── 方案设计文档.md
│   ├── UI原型设计方案_v1.md
│   ├── prototypes/               # 原型页面
│   └── superpowers/              # 阶段设计与执行计划
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── biome.json
└── vitest.config.ts
```

## 技术栈

| 层级 | 一期选型 |
| --- | --- |
| 语言 | TypeScript |
| 运行时 | Node.js 20+ |
| CLI | Commander.js |
| TUI / 终端交互 | Ink、readline、chalk、ora |
| LLM 接入 | Provider Adapter、OpenAI-compatible、Vercel AI SDK 方向 |
| MCP | `@modelcontextprotocol/sdk` |
| 配置解析 | `jsonc-parser` |
| Schema 校验 | Zod |
| 包管理 | pnpm |
| 构建 | tsup |
| 测试 | Vitest |
| Lint / Format | Biome |

## 开发命令

```bash
pnpm build
pnpm test
pnpm run lint
pnpm run typecheck
pnpm run format
pnpm run dev
```

对应 npm 也可运行：

```bash
npm run build
npm test
npm run lint
npm run typecheck
```

## 测试策略

测试覆盖重点：

- CLI 命令注册和帮助信息。
- 配置 Schema、配置合并优先级、环境变量覆盖、CLI 参数覆盖。
- OpenAI-compatible Provider 的请求和响应解析。
- 文件工具、搜索工具和工具注册中心。
- Normal / Auto 执行循环、工具调用、最大迭代限制。
- MCP Server Manager 的启动、工具注册、失败回滚、关闭清理、错误映射。
- 聊天界面的 Slash 命令、命令补全、MCP 生命周期和退出清理。

## 设计路线

项目设计文档把整体路线分为三段：

1. Phase 1：MVP 闭环，包括 CLI、配置、LLM 接入、工具系统、Normal / Auto 模式、MCP stdio 集成。
2. Phase 2：增强能力，包括 Plan / Edit 模式、模型路由、上下文压缩、MCP 管理命令、更完整的终端 UI。
3. Phase 3：成熟期能力，包括插件生态、RAG、长期记忆、成本守卫、CI/CD 集成和跨平台分发。

项目一期完成后，后续可以围绕 Plan / Edit、模型路由、MCP 管理命令、UI 体验、安全策略、RAG 和插件生态继续扩展。
