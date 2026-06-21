# Phase 1b: LLM 接入 + 基本对话 — 设计规格

> 版本：v1.0  
> 日期：2026-06-20  
> 基于：方案设计文档.md 第 7 节 Phase 1b  
> 前置：Phase 1a（项目骨架 + 核心 CLI）已完成

---

## 1. 目标

在 Phase 1a 的 CLI 骨架基础上接入 LLM，实现「输入问题 → AI 回复」的基础对话链路。

---

## 2. 新增文件清单

```
src/
├── llm/
│   ├── provider.ts               # LLMProvider 接口 + ChatParams 类型
│   ├── registry.ts               # Provider 注册中心
│   └── adapters/
│       └── openai-compat.ts      # OpenAI 兼容适配器
├── cli/
│   └── chat.ts                   # Chat REPL 交互循环
├── utils/
│   └── api-key.ts                # API Key 安全处理
└── index.ts                      # [修改] 无子命令时进入 Chat REPL

tests/
└── unit/
    ├── llm/
    │   └── openai-compat.test.ts # OpenAI 适配器单元测试
    └── chat.test.ts              # Chat REPL 逻辑测试（mock LLM）
```

---

## 3. LLM Provider 层

### 3.1 Provider 接口 (`src/llm/provider.ts`)

```typescript
export interface LLMProvider {
  readonly name: string;
  chat(params: ChatParams): Promise<LLMResponse>;
}

export interface ChatParams {
  messages: LLMMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}
```

- `LLMResponse` 和 `LLMMessage` 复用 Phase 1a 在 `src/types/provider.ts` 中定义的类型
- 先只实现非流式 `chat`，流式在 Phase 1d 加入

### 3.2 OpenAI 兼容适配器 (`src/llm/adapters/openai-compat.ts`)

- 使用 Node.js 20 原生 `fetch`
- 请求 URL：`{baseUrl}/chat/completions`
- 请求头：`Content-Type: application/json` + `Authorization: Bearer {apiKey}`
- 请求体遵循 OpenAI Chat Completions API 格式
- 错误处理：
  - HTTP 4xx/5xx → 抛出包含状态码和错误体的异常
  - 网络超时 → 60s 超时（AbortController）
  - JSON 解析失败 → 抛出解析错误

```typescript
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(config: { model: string; baseUrl: string; apiKey: string });

  async chat(params: ChatParams): Promise<LLMResponse>;
}
```

### 3.3 Provider 注册中心 (`src/llm/registry.ts`)

```typescript
export class ProviderRegistry {
  private adapters = new Map<
    string,
    new (config: ProviderConfig) => LLMProvider
  >();

  register(
    name: string,
    adapter: new (config: ProviderConfig) => LLMProvider,
  ): void;
  get(name: string): new (config: ProviderConfig) => LLMProvider | undefined;
  create(name: string, config: ProviderConfig): LLMProvider;
}
```

内置注册：

- `"openai-compatible"` → `OpenAICompatibleProvider`

从配置创建 Provider：

```typescript
export function createProviderFromConfig(config: Config): LLMProvider {
  // 1. 根据 config.model.provider 匹配适配器
  // 2. 用 config.model 创建 Provider 实例
  // 3. 返回
}
```

供应商到适配器的映射：

| 配置中的 `provider` | 实际适配器        |
| ------------------- | ----------------- |
| `deepseek`          | openai-compatible |
| `qwen`              | openai-compatible |
| `glm`               | openai-compatible |
| `ollama`            | openai-compatible |
| `custom`            | openai-compatible |

### 3.4 API Key 安全处理 (`src/utils/api-key.ts`)

```typescript
// 显示时只保留前 4 位 + 后 4 位，中间用 **** 替代
export function maskApiKey(key: string): string; // → "sk-12****ef56"

// 验证 API Key 格式（基本格式校验，非实际调用验证）
export function isValidApiKey(key: string): boolean;
```

---

## 4. Chat REPL (`src/cli/chat.ts`)

### 4.1 启动流程

```
1. ConfigResolver 加载配置
2. 如无配置 → 提示运行 code-agent init，退出
3. createProviderFromConfig(config) 创建 Provider
4. 显示欢迎屏
5. 进入 REPL 循环
```

### 4.2 欢迎屏

```
╭──────────────────────────────────────────────╮
│            Code Agent CLI  v0.1.0             │
│             终端原生编码智能体                    │
│                                              │
│  当前模型: deepseek/deepseek-coder             │
│  工作目录: /path/to/project                    │
│                                              │
│  输入 /help 查看可用命令                         │
╰──────────────────────────────────────────────╯
```

### 4.3 REPL 循环

```typescript
export async function startChat(config: Config): Promise<void> {
  // 1. 创建 Provider
  // 2. 显示欢迎屏
  // 3. readline 循环
  //    3a. 监听 keypress 事件（捕获 Shift+Tab）
  //    3b. 读取输入行
  //    3c. 处理 slash 命令 / 调用 LLM
  //    3d. 显示回复，回到 3b
}
```

### 4.4 键盘绑定

| 按键                     | 行为                                                  |
| ------------------------ | ----------------------------------------------------- |
| `Enter`                  | 提交当前输入                                          |
| `Shift+Tab` （`\x1b[Z`） | 循环切换模式：Normal → Auto → Plan → Edit → Normal... |
| `Ctrl+C`                 | 退出程序                                              |
| `↑`                      | 上一条历史记录                                        |
| `↓`                      | 下一条历史记录                                        |

### 4.5 模式状态

- 模式值定义在 `src/types/mode.ts`：`ChatMode = "normal" | "auto" | "plan" | "edit"`
- 当前模式显示在状态栏和输入行提示中
- Phase 1b 中所有模式实际行为相同（直接调用 LLM），模式切换功能提前实现好，行为在 Phase 1d 差异化
- 输入行右侧显示当前模式：`normal > ` / `auto > ` / `plan > ` / `edit > `

### 4.6 Slash 命令

| 命令            | 行为                                           |
| --------------- | ---------------------------------------------- |
| `/help`         | 显示所有可用命令                               |
| `/model <name>` | 切换模型（需已在配置中定义）                   |
| `/mode <mode>`  | 手动切换模式                                   |
| `/clear`        | 清空对话历史                                   |
| `/exit`         | 退出                                           |
| 未知命令        | 显示 `未知命令: /xxx。输入 /help 查看可用命令` |

### 4.7 对话流程

```
> 用户输入
    │
    ├── 以 / 开头 → handleSlashCommand()
    │
    └── 普通消息
        │
        ├── 1. 显示 "⏳ AI 思考中..."（spinner）
        ├── 2. provider.chat({ messages, systemPrompt })
        │
        ├── 成功 → 显示 AI 回复，保存到历史
        └── 失败 → 显示错误信息（区分：网络错误 / API 错误 / 认证错误）
```

### 4.8 对话历史

- 当前会话的消息保存在内存数组中
- `/clear` 清空历史（不重置 Provider）

### 4.9 错误处理

| 异常类型            | 用户看到的提示                   |
| ------------------- | -------------------------------- |
| API Key 无效（401） | `认证失败，请检查 API Key 配置`  |
| 余额不足（429）     | `API 配额不足，请检查账户余额`   |
| 网络超时            | `请求超时，请检查网络连接`       |
| 模型不存在（404）   | `模型 {name} 不可用，请检查配置` |
| 其他错误            | `请求失败: {错误信息}`           |

---

## 5. 入口修改 (`src/index.ts`)

无子命令时（即直接运行 `code-agent`），改为：

1. 解析 CLI 参数
2. 加载配置（`ConfigResolver.resolve()`）
3. 检查是否有模型配置 → 无则提示 `code-agent init`
4. 调用 `startChat(config)`

---

## 6. 测试策略

### 6.1 单元测试

**OpenAI 适配器** (`tests/unit/llm/openai-compat.test.ts`)：

| 测试             | 方法                                      |
| ---------------- | ----------------------------------------- |
| 构建请求体格式   | 构造 ChatParams，验证序列化后的 JSON 结构 |
| 解析成功响应     | mock fetch 返回 200 + 有效 JSON           |
| 解析工具调用响应 | mock fetch 返回含 tool_calls 的响应       |
| 处理 401 错误    | mock fetch 返回 401                       |
| 处理网络超时     | mock fetch 不返回（AbortSignal 超时）     |
| 处理空消息列表   | 至少需要 system 或 user 消息              |

**Chat REPL** (`tests/unit/chat.test.ts`)：

| 测试                    | 方法                                   |
| ----------------------- | -------------------------------------- |
| 处理普通消息并显示回复  | mock LLMProvider，验证输出包含回复内容 |
| 处理 /help 命令         | 验证输出包含命令列表                   |
| 处理 /clear 命令        | 验证历史被清空                         |
| 处理未知 Slash 命令     | 验证输出错误提示                       |
| 处理 API 错误           | mock Provider 抛出异常，验证错误提示   |
| 处理 Shift+Tab 模式切换 | mock keypress 事件，验证模式变化       |

### 6.2 集成测试（需要真实 API Key）

- 使用 DeepSeek API（用户提供 Key）测试真实调用链路
- 测试：简单问答、长回复、中文支持

### 6.3 Mock 策略

```typescript
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  constructor(private response?: LLMResponse) {}

  async chat(_params: ChatParams): Promise<LLMResponse> {
    return (
      this.response ?? {
        content: "（模拟回复）",
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        model: "mock",
      }
    );
  }
}
```

---

## 7. 依赖变更

| 包          | 变更 | 说明             |
| ----------- | ---- | ---------------- |
| `chalk`     | 已有 | 欢迎屏和消息样式 |
| `commander` | 已有 | CLI 命令框架     |

无需新增额外依赖（Node 20 原生 `fetch` 和 `readline`）

---

## 8. 不包含的范围（明确排除）

- ❌ 流式输出（`chatStream`）— Phase 1d
- ❌ 工具调用（Tool Calling）— Phase 1c
- ❌ 模式行为差异化（Normal/Auto/Plan/Edit）— Phase 1d
- ❌ MCP 集成 — Phase 1d
- ❌ Ink TUI — 后续评估
- ❌ 对话持久化 — Phase 3
