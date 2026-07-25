# Code Agent CLI 人工验收手册（Phase 1d + Phase 2）

## 1. 目的与范围

本文档用于指导 `code-agent-cli` 当前版本的人工验收，覆盖以下范围：

- Phase 1d：`Normal + Auto 模式 + MCP`
- Phase 2：`Plan / Edit / 终端命令执行 / 模型路由 / 成本统计 / MCP 管理命令 / 更多模型适配`

本文档以当前代码仓库的**实际交付物**为准，不以纯设计态为准。

不在本次验收范围内的内容：

- Phase 3 及以后内容
- 完整 Ink React TUI 重构
- RAG 能力
- CI/CD、GitHub Actions、发布流程

## 2. 当前实现与设计差异

人工验收前，建议先明确以下已知差异，避免误判：

1. 当前交互基于 `readline + console`，不是完整 Ink TUI。
2. Phase 1d 设计稿中提到的“持续状态栏”当前未完整落地，不应作为本轮必过项。
3. `run_terminal` 当前基于 `child_process.exec`，不是设计文档中的 `node-pty`。
4. 配置文件中的 `${VAR_NAME}` 占位符当前不会自动解析；验收时应直接填写实际值，或使用 `CODE_AGENT_*` 环境变量。

如果验收结论要求“与设计完全一致”，则以上差异需单独记录为设计偏差；如果验收标准以“当前阶段交付是否可用”为主，则以上差异不构成直接阻塞。

## 3. 环境要求

建议使用以下环境进行验收：

- Node.js 20+
- pnpm 9+
- 可访问至少一个兼容 OpenAI 接口的模型服务
- Windows PowerShell 或其他本地终端

建议在项目根目录执行所有命令：

```powershell
Set-Location D:\JAVA\code-agent-cli
```

## 4. 启动前准备

### 4.1 安装依赖与构建

执行以下命令：

```powershell
pnpm install
pnpm run build
pnpm test
pnpm run lint
pnpm run typecheck
```

预期结果：

- 依赖安装成功
- 构建成功
- 单元测试通过
- lint 通过
- typecheck 通过

### 4.2 基础命令可用性检查

执行以下命令：

```powershell
node dist/index.js --help
node dist/index.js config --help
node dist/index.js mcp --help
```

预期结果：

- 主命令能显示 `init`、`config`、`mcp`
- `config` 子命令至少包含 `set/get/list/edit`
- `mcp` 子命令至少包含 `add/remove/list`

### 4.3 验收配置准备

推荐在项目根目录创建 `.code-agent.jsonc` 作为验收配置，避免影响全局环境。

推荐配置模板：

```jsonc
{
  "model": {
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "apiKey": "<deepseek-api-key>"
  },
  "models": {
    "code": {
      "provider": "deepseek",
      "model": "deepseek-v4-pro",
      "apiKey": "<deepseek-api-key>"
    },
    "reason": {
      "provider": "qwen",
      "model": "qwen-plus",
      "apiKey": "<qwen-api-key>"
    },
    "fast": {
      "provider": "deepseek",
      "model": "deepseek-v4-flash",
      "apiKey": "<deepseek-api-key>"
    }
  },
  "mode": "normal",
  "yolo": false,
  "costGuard": {
    "monthlyBudget": 0.0001,
    "warnAtPercent": 1
  },
  "mcpServers": {}
}
```

说明：

- 如果没有多家模型密钥，也可以把 `code/reason/fast` 都配置成同一家不同模型。
- 若要验收新增模型适配，可把 `provider` 改为 `kimi`、`doubao`、`spark` 中任一可用服务。
- 如果使用 `ollama`，可不填 `apiKey`。

## 5. 项目启动验收

### 5.1 启动交互模式

执行：

```powershell
node dist/index.js
```

预期结果：

- 成功进入交互界面
- 欢迎区至少能看到以下信息：
  - 产品名称
  - 当前模型
  - API Key 脱敏结果
  - 当前工作目录
  - MCP 汇总
  - `/help` 提示

### 5.2 非交互模式

执行：

```powershell
node dist/index.js --prompt "读取 package.json 并告诉我 name 字段"
```

预期结果：

- 可以直接执行一次单轮任务
- 能输出工具调用结果或最终回答
- 任务结束后正常退出

## 6. Phase 1d 人工验收

### P1D-01 模式与 Slash 命令

步骤：

1. 启动交互模式。
2. 依次输入：
   - `/help`
   - `/model`
   - `/mode auto`
   - `/mode normal`
   - `/usage`

预期结果：

- `/help` 能展示可用命令
- `/model` 能显示当前模型
- `/mode auto` 与 `/mode normal` 能切换成功
- `/usage` 能显示 token 统计信息

### P1D-02 输入增强

步骤：

1. 输入 `/mo`
2. 按 `Tab`
3. 按 `Ctrl+T`

预期结果：

- `Tab` 能补全 slash 命令
- `Ctrl+T` 能在 `normal / auto / plan / edit` 之间循环切换

### P1D-03 Normal 模式

步骤：

1. 执行 `/mode normal`
2. 输入：

```text
读取 package.json，并总结 scripts 字段，不要修改任何文件
```

预期结果：

- AI 可调用只读工具
- 若出现需要确认的工具调用，确认后可继续
- 最终能给出 `scripts` 总结

### P1D-04 Auto 模式

步骤：

1. 执行 `/mode auto`
2. 输入：

```text
依次读取 package.json、src/index.ts、src/cli/commands.ts，总结 CLI 的启动链路，不要修改文件
```

预期结果：

- 能看到多轮执行过程
- 能自动继续下一步，而不是只做一轮
- 最终能输出启动链路总结
- 若达到最大迭代上限，应明确提示任务可能未完成

### P1D-05 清空对话

步骤：

1. 输入：`记住口令 ABC`
2. 输入：`/clear`
3. 再输入：`刚才口令是什么？`

预期结果：

- `/clear` 提示清空成功
- 清空后不应继续使用清空前的对话上下文

### P1D-06 MCP 管理与自动发现

步骤：

1. 执行：

```powershell
node dist/index.js mcp add filesystem npx -y @modelcontextprotocol/server-filesystem .
```

说明：

- `npx -y ...` 这类子进程参数会在 `<command>` 后原样透传。
- 如果要使用 `mcp add` 自身的 `--transport`、`--url`、`--env` 选项，请放在服务名之前，例如：

```powershell
node dist/index.js mcp add --transport sse filesystem npx server.js
```

2. 执行：

```powershell
node dist/index.js mcp list
```

3. 启动交互模式：

```powershell
node dist/index.js
```

预期结果：

- `mcp add` 成功
- `mcp list` 中能看到 `filesystem`
- 启动后欢迎区能看到 `MCP: 1 servers / N tools`

### P1D-07 MCP 工具调用

步骤：

在交互模式输入：

```text
请使用 mcp_filesystem_read_file 读取 package.json 的内容，并告诉我 name 字段
```

预期结果：

- 出现 `mcp_filesystem_*` 工具调用
- 工具执行成功
- 最终返回 `name` 字段结果

## 7. Phase 2 人工验收

### P2-01 Plan 模式生成计划

步骤：

1. 执行 `/mode plan`
2. 输入：

```text
请分步骤分析项目启动链路，不修改任何文件
```

预期结果：

- 输出结构化 `[PLAN]`
- 至少包含 1 个步骤
- 提示输入 `Y` 确认、`N` 取消、或输入修改意见

### P2-02 Plan 模式修改计划

步骤：

在上一个计划等待状态下输入：

```text
把读取 package.json 放在第一步
```

预期结果：

- 计划被重新生成
- 不会直接执行旧计划

### P2-03 Plan 模式取消计划

步骤：

在计划等待状态下输入：

```text
n
```

预期结果：

- 明确提示计划已取消
- 后续不会误执行旧计划

### P2-04 Plan 模式批准执行

步骤：

1. 重新生成一个只读计划
2. 在等待状态下输入：

```text
y
```

预期结果：

- 计划开始按步骤执行
- 步骤状态有变化
- 全部完成后出现 `Plan completed`

### P2-05 Edit 模式正向场景

步骤：

1. 执行 `/mode edit`
2. 输入：

```text
读取 src/index.ts 和 src/cli/commands.ts，总结命令入口，不要执行任何终端命令
```

预期结果：

- 可以正常调用文件/搜索类工具
- 最终能返回代码总结

### P2-06 Edit 模式工具隔离

步骤：

1. 保持 `/mode edit`
2. 输入：

```text
请执行 node --version 并返回结果
```

预期结果：

- 不应调用 `run_terminal`
- 应拒绝、降级、或说明当前模式不执行终端命令

### P2-07 终端工具正向能力

步骤：

1. 执行 `/mode normal`
2. 输入：

```text
请使用终端命令 node --version 获取当前 Node 版本
```

预期结果：

- 出现 `run_terminal` 工具调用
- 用户确认后命令执行成功
- 返回当前 Node 版本

### P2-08 终端工具安全拦截

步骤：

输入：

```text
请使用终端执行 rm -rf / 并报告工具返回
```

预期结果：

- 工具应拒绝执行
- 应看到“危险命令已拦截”或等价错误
- 绝不能真实执行危险命令

### P2-09 MCP 管理命令

步骤：

依次执行：

```powershell
node dist/index.js mcp list
node dist/index.js mcp remove filesystem
node dist/index.js mcp list
node dist/index.js mcp add filesystem npx -y @modelcontextprotocol/server-filesystem .
node dist/index.js mcp list
```

说明：

- 若本轮需要验证 `mcp add` 自身选项，请使用前置写法，例如：`node dist/index.js mcp add --transport sse filesystem npx server.js`

预期结果：

- `list/remove/add/list` 整体链路可用
- 删除后列表中不再有目标项
- 重新添加后列表中恢复显示

### P2-10 成本统计

步骤：

1. 在任意正常会话中发起 1 到 2 次真实模型请求
2. 输入：

```text
/cost
```

预期结果：

- 能输出总费用
- 能输出分模型费用
- 至少包含当前实际使用到的模型名

### P2-11 预算告警

步骤：

1. 保持极小预算配置，例如：
   - `monthlyBudget: 0.0001`
   - `warnAtPercent: 1`
2. 再发起 1 次实际模型请求

预期结果：

- 控制台出现预算告警

### P2-12 模型路由

步骤：

依次输入以下三类任务：

1. 代码生成类：

```text
请实现一个示例函数，只输出实现思路，不修改文件
```

2. 分析类：

```text
请分析 src/cli/chat.ts 的职责，不修改文件
```

3. 通用对话类：

```text
你好，介绍一下这个项目
```

4. 然后输入：

```text
/cost
```

预期结果：

- `/cost` 中应出现多个模型名，或至少能看出不同任务落到了不同路由目标
- 若配置了 `code/reason/fast` 为不同模型，账单中应有对应模型记录

### P2-13 新增 Provider 兼容性

步骤：

至少选择以下任一 provider 完成一次真实请求：

- `kimi`
- `doubao`
- `spark`

建议命令：

```powershell
node dist/index.js --prompt "你好，请简单介绍自己"
```

预期结果：

- 对应 provider 能正常启动
- 能成功完成一轮请求

如需完整覆盖“更多国产模型”能力，应对 `kimi / doubao / spark` 各自至少验证 1 次。

## 8. 验收结论标准

### 8.1 通过

满足以下条件可判定为“通过”：

- 项目可正常安装、构建、测试、lint、typecheck
- Phase 1d 核心闭环可用
- Phase 2 核心能力可用
- 无严重阻断性问题

### 8.2 有条件通过

满足以下条件可判定为“有条件通过”：

- 核心流程可用
- 已知设计偏差被接受
- 问题主要集中在非阻断项，例如：
  - 非 Ink 完整 TUI
  - 无持续状态栏
  - `run_terminal` 非 `node-pty`
  - 配置不解析 `${VAR_NAME}`

### 8.3 不通过

出现以下任一情况即可判定为“不通过”：

1. 项目无法启动。
2. `normal / auto / plan / edit` 任一模式不可用。
3. `/clear` 后旧计划仍可被误执行。
4. `edit` 模式可直接调用 `run_terminal`。
5. MCP 服务无法启动，或工具无法自动发现。
6. `/cost` 与预算告警完全不可用。
7. 模型路由无论任务类型如何都无法区分。
8. 危险终端命令未被拦截。

## 9. 验收记录建议

建议对每个用例记录以下信息：

- 用例编号
- 执行人
- 执行时间
- 输入命令或提示词
- 实际结果
- 是否通过
- 备注/截图位置

可使用如下记录格式：

```text
用例编号：
执行时间：
执行人：
输入：
实际结果：
是否通过：
备注：
```
