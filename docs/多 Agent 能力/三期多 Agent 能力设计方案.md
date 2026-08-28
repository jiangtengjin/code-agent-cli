# Code Agent CLI 三期多 Agent 能力设计方案

> 版本：v1.0
> 日期：2026-08-27
> 状态：方案评审稿
> 参考产品：Claude Code（Task 工具 / Subagents）、OpenAI Swarm
> 适用范围：Code Agent CLI Phase 3 多 Agent 能力

---

## 1. 背景与目标

一期与二期已经完成以下闭环：

- 本地 CLI 对话与 Ink TUI 统一交互
- Normal / Auto / Plan / Edit 四种模式
- 内置工具与 MCP 工具调用
- 会话持久化、恢复、fork、archive
- usage / cost / plan 状态管理

当前所有任务都由**单一 agent 在单一上下文中**完成，由此产生两个问题：

1. **上下文污染**
   一次代码库探索可能产生几十次 `grep_search` / `read_file`，原始输出全部堆积在
   `context.messages` 里。主对话很快被工具噪音撑满，真正重要的结论被淹没。

2. **无法为子任务定制行为**
   "查一遍某个模块的实现"和"实现一个功能"需要的工具集、system prompt、迭代预算
   完全不同，但目前只能共用当前模式的配置。

本期目标是引入**子 agent 委派能力**：主 agent 可以把一个自包含的子任务交给一个
独立配置、独立上下文的子 agent 执行，只接收其最终结论。

本期**不做** TUI 重构，也**不做**并行执行。

---

## 2. 竞品结论与采纳策略

### 2.1 三种多 Agent 范式

| 范式 | 代表 | 机制 | 代价 |
| --- | --- | --- | --- |
| 子 agent 即工具 | Claude Code Task 工具 | 主 agent 调工具派生子 agent，子级独立上下文，只回传最终文本 | 需要设计任务描述契约 |
| 交接式路由 | OpenAI Swarm | agent 之间 handoff 控制权，对话仍是一条线 | 上下文不隔离，收益有限 |
| 对等协作 / 黑板 | AutoGen 等 | 多 agent 共享状态互相讨论 | 难调试，收益模糊 |

### 2.2 本方案明确采纳的模式

1. `子 agent 即工具`
   - 主 agent 通过 `spawn_agent` 工具派生子 agent
   - 子 agent 不继承父级消息历史
   - 只把最终文本作为 `ToolResult` 回传

2. `上下文隔离优先，并行延后`
   - 本期只做串行子 agent
   - 并行执行不进入本期范围

3. `子 agent 默认只读`
   - 默认工具集为 `read_file` / `list_dir` / `glob_search` / `grep_search`
   - 写操作统一回到主 agent

4. `markdown 文件定义 agent`
   - `.code-agent/agents/*.md`，frontmatter 放元数据、正文当 system prompt
   - 不在 JSONC 配置里塞多行 prompt

5. `先统一 mode 与 agent`
   - 现有四个 mode 本质就是 agent 定义，先合并成一套注册表再加子 agent

### 2.3 本期不采纳的模式

- 并行执行多个子 agent
- 子 agent 递归派生子 agent（深度上限 1）
- 交接式路由 / 对等协作
- 子 agent 写文件或执行终端命令
- 跨会话的 agent 记忆

---

## 3. 核心产品决策

### 3.1 为什么只做隔离，不做并行

隔离与并行不是两个可选项，而是叠起来的两层：**隔离是并行的前提**。如果子 agent
共享父级上下文，并行的几条线会互相污染，既省不下 token 也无法独立收敛。反过来，
只做隔离是完全有效的。

两者的成本收益严重不对称：

| | 收益 | 工程成本 |
| --- | --- | --- |
| 隔离 | token 节省、主对话干净、可定制子任务行为 | 近乎为零，`runExecutionLoop` 已可重入 |
| 并行 | 仅墙上时钟时间 | TUI 状态重构、审批串行化、限流退避、AbortSignal 组合、`index.json` 加锁 |

更重要的是**可调试性**。子 agent 真正的难点是"什么时候该派"和"任务描述怎么写才
自包含"，这两件事只能靠实际使用积累手感。如果同时上并行，子 agent 答错时无法
区分是 prompt 交代不清还是竞态——单线程下这是确定性可复现的，并行下不是。

这不是单向门。本期在 `InteractionEvent` 上预埋 `agentId`，并行的门始终开着。

### 3.2 并行的替代方案

最常见的子 agent 用途恰恰是"同时查三个模块"，这正是并行受益的场景。但这里有一条
比并行 agent 便宜得多的路：

`src/session/execution.ts:117` 的 `for` 循环让同一轮内的多个工具调用严格串行。
把其中不需要确认的只读工具改成并发执行，能拿到相当一部分同样的延迟收益，改动范围
仅限一个文件，不碰 TUI、不碰审批。

真正的延迟大头是 LLM 往返次数而非工具执行时间——一个子 agent 串行做 10 次 grep
也只需 3–4 轮对话。

### 3.3 重新评估并行的触发条件

当出现以下情况时再重新评估阶段 3：

- 经常需要在一轮内派 3 个以上互相独立的探索
- 且每个探索耗时超过 30 秒

在此之前，并行属于投机性投入。

### 3.4 为什么先统一 mode 与 agent

现有四个 mode 的实质构成：

| mode | maxIterations | 工具集 | system prompt |
| --- | --- | --- | --- |
| normal | 10 | 全部 | `config.systemPrompt` |
| auto | 25 | 全部 | `config.systemPrompt` |
| edit | 10 | 8 个白名单 | `config.systemPrompt` |
| plan | 20 | 无 | 自带 `PLAN_SYSTEM_PROMPT` |

这就是 `{ maxIterations, tools, systemPrompt }`——一个 agent 定义。`normal` 与
`auto` 除迭代上限外完全相同。

若不先合并，会出现两套并行的注册表干同一件事：`ModeRouter` 管 mode，新的 agent
注册表管子 agent，而两者消费的是同一个 `RunContext`。

### 3.5 为什么子 agent 默认只读

只读这一个约束同时消掉三类问题：

- **写冲突**：两个子 agent 改同一文件属于不确定性损坏，难复现难调试
- **审批归属**：只读工具不需要 `requiresConfirm`，无需解决"子 agent 的审批弹窗归谁"
- **回滚语义**：子 agent 失败时无需撤销副作用

且这匹配现实：并行探索常见，并行改动几乎从不是好主意。

---

## 4. Agent 模型设计

### 4.1 AgentDefinition 核心对象

```ts
export interface AgentDefinition {
  /** 唯一标识，同时作为 spawn_agent 的 agent_type 取值 */
  name: string;
  /** 给主 agent 看的用途描述，决定它何时派生该子 agent */
  description: string;
  /** system prompt，来自 markdown 正文 */
  systemPrompt?: string;
  /**
   * 工具白名单。
   * 支持精确名与 `mcp_*` 前缀通配，undefined 表示继承父级全部工具。
   */
  tools?: string[];
  /** 迭代上限 */
  maxIterations: number;
  /** models 别名或完整 LLMConfig */
  model?: string | LLMConfig;
  /** 是否允许作为子 agent 被派生。内置 mode 为 false */
  spawnable: boolean;
  /** 定义来源，用于冲突排查 */
  source: "builtin" | "global" | "project";
}
```

### 4.2 内置 agent 与自定义 agent

四个内置 mode 转为预置 `AgentDefinition` 条目，`spawnable: false`：

```ts
const BUILTIN_AGENTS: AgentDefinition[] = [
  { name: "normal", maxIterations: 10, spawnable: false, source: "builtin", ... },
  { name: "auto",   maxIterations: 25, spawnable: false, source: "builtin", ... },
  { name: "edit",   maxIterations: 10, tools: SAFE_EDIT_TOOL_NAMES, spawnable: false, ... },
  { name: "plan",   maxIterations: 20, tools: [], spawnable: false, ... },
];
```

### 4.3 plan 是必须保留的特例

`plan` 无法纯声明式表达，原因有两处：

1. `PlanModeHandler.run`（`src/modes/plan.ts:376`）绕过 `runExecutionLoop`，
   直接调 `provider.chat` 且不传 `tools`
2. `executeApprovedPlan`（`src/modes/plan.ts:307`）是独立的编排逻辑，
   按步骤循环调用 `runExecutionLoop`

因此注册表结构必须是**声明式定义 + 可选 handler 覆盖**：

```ts
export interface AgentRegistryEntry {
  definition: AgentDefinition;
  /** 存在时走自定义编排，否则走默认 runExecutionLoop */
  handler?: ModeHandler;
}
```

`plan` 提供 handler，其余三个内置 agent 与所有自定义 agent 均走默认路径。

### 4.4 markdown 定义格式

`.code-agent/agents/code-explorer.md`：

```markdown
---
description: 在代码库中定位实现、追踪调用链、回答“X 在哪里定义”类问题
tools: [read_file, list_dir, glob_search, grep_search]
maxIterations: 15
model: fast
---

你是一个代码库探索专家。你的任务是定位信息并回报结论。

你看不到主对话的任何内容，任务描述里的信息就是你拥有的全部背景。

回报时必须包含具体的文件路径与行号。不要输出你的搜索过程，只输出结论。
```

frontmatter 字段与 `AgentDefinition` 对齐，`name` 由文件名推导。

### 4.5 加载优先级

与 `ConfigResolver` 既有优先级对齐，低到高：

1. 内置 agent
2. 全局 `~/.config/code-agent/agents/*.md`
3. 项目 `.code-agent/agents/*.md`

同名时高优先级整体覆盖（不做字段级合并，避免 prompt 被拼接产生歧义）。
自定义 agent 不允许覆盖内置 agent 名（`normal` / `auto` / `plan` / `edit`），
加载时报警告并跳过。

`Config` 另加一个可选开关用于全局禁用：

```ts
agents?: {
  enabled?: boolean;
  maxConcurrency?: number;  // 预留，本期恒为 1
};
```

需在 `deepMerge`（`src/config/resolver.ts:64`）中加一个 `else if` 分支，
与既有 `model` / `models` / `mcpServers` / `sessions` 的浅合并处理一致。

---

## 5. 子 Agent 执行设计

### 5.1 spawn_agent 工具

```ts
{
  name: "spawn_agent",
  description: "把一个自包含的子任务委派给独立的子 agent 执行……",
  parameters: {
    agent_type: { type: "string", enum: [...spawnableAgentNames] },
    task: { type: "string", description: "完整的任务描述" },
  },
  requiresConfirm: false,
}
```

`ToolDefinition.execute` 只接受 `args`，没有 context 参数
（`src/types/tool.ts:9`）。因此 `spawn_agent` 必须在注册时通过**闭包捕获**
父级的 provider、registry、config、事件桥与 depth。

### 5.2 子 agent 的上下文构造

子 agent 拿到一个全新的 `RunContext`：

| 字段 | 取值 |
| --- | --- |
| `messages` | **全新空数组**，不 clone 父级 |
| `toolRegistry` | 按 `definition.tools` 过滤出的新 `ToolRegistry` |
| `systemPrompt` | `definition.systemPrompt` |
| `provider` | 按 `definition.model` 解析，缺省继承父级 |
| `usageTracker` | 独立实例，结束后合并进父级 |
| `timing` | 独立实例 |
| `abortSignal` | 继承父级 |
| `skipConfirm` | 继承父级 |
| `onMessagesChanged` | `undefined`，子级历史不持久化 |

注意**不使用 `forkSessionState`**——它的 `structuredClone` 语义是给 `/fork`
用的，与子 agent 的隔离目标相反。

### 5.3 RunContext 需要新增 systemPrompt

当前 system prompt 在循环内部从 `context.config.systemPrompt` 读取
（`src/session/execution.ts:149`），mode 无法覆盖——这正是 `plan` 不得不绕过
`runExecutionLoop` 的原因之一。

```ts
export interface RunContext {
  // ...既有字段
  /** 覆盖 config.systemPrompt，供 agent 定制 prompt */
  systemPrompt?: string;
}
```

循环内改为 `context.systemPrompt ?? context.config.systemPrompt`。

这个改动同时让 `plan` 未来有机会回归标准路径，但本期不做该重构。

### 5.4 工具集过滤

复用 `EditModeHandler.createEditToolRegistry`（`src/modes/edit.ts:16`）的模式，
但需支持前缀通配。

现有 `SAFE_EDIT_TOOL_NAMES` 是固定精确白名单，导致 **MCP 工具在 edit 模式下
完全不可见**（MCP 工具注册名为 `mcp_<server>_<tool>`）。子 agent 的白名单必须
支持 `mcp_*` 或 `mcp_<server>_*` 形式，否则会继承同一缺陷。

子 agent 的 registry **必须剔除 `spawn_agent` 本身**，配合 depth 计数器双重
兜底防递归。

### 5.5 预算与防护

| 防护 | 取值 |
| --- | --- |
| 派生深度 | 上限 1（仅主 agent 可派生） |
| 并发数 | 本期恒为 1（串行 await） |
| 迭代上限 | 各 agent 独立，取自 definition |
| 单次任务描述长度 | 上限校验，防止父级把整段历史塞进来 |
| 回传长度 | 超长截断并标注 |

### 5.6 回传语义

子 agent 的 `ModeRunResult.assistantContent` 作为 `ToolResult` 回传：

```ts
{ success: true, data: { agent: "code-explorer", result: "<最终文本>" } }
```

失败情况：

- 子 agent 达到迭代上限：`success: true` 但附 `truncated: true` 与警告
- 子 agent 抛错：`success: false`，error 透传
- 父级 abort：`success: false`，error 为 "Aborted"

主 agent 的消息历史里只出现一条 `spawn_agent` 的 tool 结果，子 agent 内部的
几十次工具调用**完全不进入父级上下文**——这是本方案的全部收益来源。

### 5.7 任务描述契约

这是本方案唯一无法靠代码保证的部分。子 agent 看不到对话历史，父级必须把全部
背景写进 `task` 参数。写砸的表现是**子 agent 自信地答错**，因为它不知道自己
缺信息。

缓解手段只有把 `spawn_agent` 的工具描述写得足够严厉：

> `task` 必须完全自包含。子 agent 看不到你与用户的对话，不知道当前文件、
> 不知道之前的结论。把它需要的一切写进去，包括相关路径、已排除的可能性、
> 你期望的回报格式。

---

## 6. 事件与 TUI 集成设计

### 6.1 必须在本期完成的预埋

给 `InteractionEvent` 所有变体加上 agent 归属字段：

```ts
export interface InteractionEventAgentScope {
  /** 缺省视为主 agent */
  agentId?: string;
  /** 子 agent 才有 */
  parentAgentId?: string;
  /** agent 定义名，用于 UI 展示 */
  agentName?: string;
}
```

**这件事必须在本期做，即使串行阶段用不上。** 当前
`src/interaction/events.ts:101` 的 14 个变体全部不带标识，事后补要动所有 emit
点，成本差一个数量级。`InteractionEventEmitter` 本身无需改动——它已经是
id 无关的扇出。

### 6.2 必须修复的 reducer 缺陷

`src/tui/shell/reducer.ts:183` 在 `session.changed` 且 id 不同时会清空
`chat` / `approvals` / `tasks`。子 agent 一旦发出自己的 session summary，
就会**擦掉父级已渲染的整个对话**。

修复方式：该分支加上 agent 归属判断，只有主 agent 的 session 变更才触发重置。

### 6.3 本期 UI 表现

串行子 agent 的事件是连续一段到达的（父级在 `await`，不会交错），因此现有
按时间戳合并的时间线仍然可读。

本期把子 agent 折叠成一行 task 展示，复用现有 `ShellTaskEntry`——它已经带
`id` / `title` / `status` / `detail`，`src/tui/scenes/tasks.tsx` 场景现成：

```
⚙ code-explorer  running   查找 ToolRegistry 的所有注册点
✓ code-explorer  done      找到 3 处：built-in/index.ts:13、mcp/manager.ts:82…
```

子 agent 内部的工具调用**不进入** `chat.messages`，只更新该 task 行的 detail。
这与上下文隔离的语义一致：主时间线看到的就是主 agent 看到的。

### 6.4 不进入本期的 TUI 工作

- `ShellState.chat` 改为按 agentId 索引的 map
- 展开查看单个子 agent 的详细流水
- 多审批队列 UI
- 拆除 `src/tui/adapters/chat-controller.ts:385` 的并发拒绝
  （子 agent 从工具内部启动，不经过 `submitTask`，故本期不受其影响）

### 6.5 CLI 宿主的限制

`src/cli/chat.ts` 的交互式模式使用单个 ora spinner 加直接 ANSI 光标操作。
本期串行子 agent 在 CLI 下可用（同一时刻只有一个 spinner），但 spinner 文案
需要反映当前活跃的子 agent 名。

未来并行执行的宿主**只能是 Ink TUI**，CLI 路径应明确保持串行。

---

## 7. 实施阶段划分

### 阶段 0：统一 mode 与 agent

- 新增 `AgentDefinition` / `AgentRegistryEntry` 类型
- `ChatMode` 从四字面量闭合联合改为按 name 索引的注册表
- 四个内置 mode 转为预置条目，`plan` 保留 handler 覆盖
- `RunContext` 新增 `systemPrompt`，循环改为优先使用它
- `ModeRouter` 的硬编码 if 链改为注册表查找

破坏性但一次性。`ChatMode` 作为类型被 `SessionState`、`InteractionEvent`、
`ResumeCatalogItem` 等多处引用，需要一并评估——建议保留 `ChatMode` 为
`string` 别名以减少波及面。

### 阶段 1：markdown agent 加载器

- frontmatter 解析（`.code-agent/agents/*.md`）
- 三层优先级加载与同名覆盖
- 内置名保护与冲突警告
- `Config.agents` 开关与 `deepMerge` 分支
- 加载失败降级（单个文件解析失败不影响其余）

### 阶段 2：串行 spawn_agent

- `spawn_agent` 工具，闭包注入父级依赖
- 子 agent context 构造（空 messages、过滤 registry、独立 tracker）
- 工具白名单支持 `mcp_*` 前缀通配
- depth 上限与 registry 剔除双重防递归
- `InteractionEvent` 加 agent 归属字段（**本阶段必须完成**）
- 修复 `reducer.ts:183` 的清空缺陷
- 子 agent 折叠为 task 行展示
- usage / cost 合并回父级

### 阶段 3：并行执行（不进入本期）

仅在满足 3.3 触发条件后启动。届时需要：

- `ShellState.chat` 改为按 agentId 索引
- 并发信号量（3–5）
- 组合 AbortSignal
- `SessionStore.saveSession`（`src/session/store.ts:57`）的
  read-modify-write 加锁
- 多审批队列 UI
- provider 限流退避
- 拆除 chat-controller 的并发拒绝

---

## 8. 风险与已知缺陷

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 任务描述不自包含 | 子 agent 自信答错，无法察觉 | 严厉的工具描述；实践中积累 prompt 手感 |
| 派生时机判断失当 | 派太少无收益，派太多重复交代背景更慢更贵 | `description` 字段写清适用场景；观察后调整 |
| `ChatMode` 类型波及面 | 阶段 0 改动范围超预期 | 保留为 `string` 别名 |
| 子 agent 用 `fast` 模型质量不足 | 结论不可靠 | 模型可按 agent 覆盖；探索类先试 `fast`，不达标回退 |
| MCP 工具白名单遗漏 | 子 agent 拿不到预期的 MCP 工具 | 支持前缀通配；加载时对未匹配的白名单项告警 |
| 子级历史不持久化 | 事后无法复盘子 agent 行为 | 本期接受；必要时降级为写调试日志 |

---

## 9. 验收要点

- 四个内置 mode 行为与重构前完全一致（含 plan 的计划-审批-执行链路）
- 自定义 agent 可被主 agent 正确派生并回传结论
- 子 agent 的工具调用不出现在主 agent 的 `messages` 中
- 子 agent 无法派生子 agent（depth 与 registry 双重验证）
- 子 agent 运行期间父级 abort 能正确中断
- 子 agent 的 token 用量正确合并进父级统计
- 子 agent 发出 session 事件不会清空父级 TUI 对话
- 项目级 agent 定义覆盖同名全局定义
- 单个 markdown 文件格式错误不影响其余 agent 加载
- `agents.enabled: false` 时 `spawn_agent` 不出现在工具列表中
