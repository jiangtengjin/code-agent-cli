# Phase 1c: 工具系统+读写文件 - 设计文档

> 版本：v1.0  
> 日期：2026-07-04  
> 状态：已批准  
> 基于：方案设计文档 v1.0

---

## 1. 概述

### 1.1 目标

实现工具系统，使AI能够读取和编辑项目文件。这是Code Agent CLI的核心价值之一。

### 1.2 范围

- 实现ToolRegistry工具注册中心
- 实现文件操作工具组（read_file, write_file, edit_file, create_file, delete_file, list_dir）
- 实现搜索工具组（glob_search, grep_search）
- 实现工具调用机制
- 实现工具确认机制
- 集成到现有chat.ts

### 1.3 不在范围内

- 终端命令执行工具（run_terminal）- Phase 2
- 网页工具（web_fetch, web_search）- Phase 2
- MCP工具集成 - Phase 1d

---

## 2. 架构设计

### 2.1 核心组件

```
┌─────────────────────────────────────────────────┐
│                  Tool System                     │
│  ┌─────────────────────────────────────────┐  │
│  │         ToolRegistry                    │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │  │
│  │  │File  │ │Search│ │Custom│ │  ... │ │  │
│  │  │Tools │ │Tools │ │Tools │ │      │ │  │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │         Tool Execution                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐ │  │
│  │  │Parameter │ │Security  │ │Result  │ │  │
│  │  │Validation│ │Check     │ │Format  │ │  │
│  │  └──────────┘ └──────────┘ └────────┘ │  │
│  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 2.2 数据流

```
LLM响应 (toolCalls)
    │
    ▼
解析toolCalls
    │
    ▼
ToolRegistry.get(toolName)
    │
    ├── 工具不存在 → 返回错误
    │
    ▼
参数验证 (JSON Schema)
    │
    ├── 验证失败 → 返回错误
    │
    ▼
安全检查 (requiresConfirm)
    │
    ├── 需要确认 → 用户确认
    │   ├── 确认 → 执行工具
    │   └── 取消 → 返回错误
    │
    └── 无需确认 → 执行工具
    │
    ▼
tool.execute(args)
    │
    ▼
ToolResult { success, data?, error? }
    │
    ▼
返回给LLM继续处理
```

---

## 3. 类型定义

### 3.1 工具类型

```typescript
// src/types/tool.ts

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  requiresConfirm?: boolean; // 需要用户确认
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    filePath?: string;
    diff?: string;
    lineCount?: number;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
```

### 3.2 文件操作参数类型

```typescript
// 文件操作工具参数
export interface ReadFileArgs {
  path: string;
  offset?: number;
  limit?: number;
}

export interface WriteFileArgs {
  path: string;
  content: string;
}

export interface EditFileArgs {
  path: string;
  oldString: string;
  newString: string;
}

export interface CreateFileArgs {
  path: string;
  content: string;
}

export interface DeleteFileArgs {
  path: string;
}

export interface ListDirArgs {
  path: string;
  depth?: number;
  pattern?: string;
}
```

### 3.3 搜索工具参数类型

```typescript
// 搜索工具参数
export interface GlobSearchArgs {
  pattern: string;
  path?: string;
  ignore?: string[];
}

export interface GrepSearchArgs {
  pattern: string;
  path?: string;
  include?: string;
  ignoreCase?: boolean;
  maxResults?: number;
}
```

---

## 4. 工具实现

### 4.1 文件操作工具

#### 4.1.1 read_file

```typescript
// src/tools/built-in/file.ts

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: '读取指定文件的内容，支持行范围',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      offset: { type: 'number', description: '起始行号（从1开始）' },
      limit: { type: 'number', description: '读取行数' },
    },
    required: ['path'],
  },
  requiresConfirm: false,
  async execute(args) {
    const { path, offset, limit } = args as ReadFileArgs;
    
    try {
      const content = await fs.readFile(path, 'utf-8');
      const lines = content.split('\n');
      
      // 处理行范围
      const start = offset ? Math.max(1, offset) : 1;
      const end = limit ? Math.min(lines.length, start + limit - 1) : lines.length;
      const selectedLines = lines.slice(start - 1, end);
      
      return {
        success: true,
        data: {
          content: selectedLines.join('\n'),
          totalLines: lines.length,
          startLine: start,
          endLine: end,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `读取文件失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
```

#### 4.1.2 edit_file

```typescript
export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: '精确编辑文件内容（搜索替换）',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      oldString: { type: 'string', description: '需要替换的原始文本' },
      newString: { type: 'string', description: '替换后的新文本' },
    },
    required: ['path', 'oldString', 'newString'],
  },
  requiresConfirm: true,
  async execute(args) {
    const { path, oldString, newString } = args as EditFileArgs;
    
    try {
      const content = await fs.readFile(path, 'utf-8');
      
      if (!content.includes(oldString)) {
        return {
          success: false,
          error: `在 ${path} 中未找到匹配的文本。前 100 个字符: "${content.slice(0, 100)}"`,
        };
      }
      
      const newContent = content.replace(oldString, newString);
      await fs.writeFile(path, newContent, 'utf-8');
      
      // 生成diff（使用简单的行对比算法）
      const diff = generateDiff(content, newContent);
      
      return {
        success: true,
        data: { path, diff },
        metadata: { filePath: path, diff },
      };
    } catch (error) {
      return {
        success: false,
        error: `编辑文件失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
```

#### 4.1.3 其他文件工具

类似实现：
- `write_file` - 写入文件，需确认
- `create_file` - 创建文件，自动创建目录
- `delete_file` - 删除文件，需确认
- `list_dir` - 列出目录内容

### 4.2 搜索工具

#### 4.2.1 glob_search

```typescript
export const globSearchTool: ToolDefinition = {
  name: 'glob_search',
  description: '使用glob模式搜索文件',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'glob模式' },
      path: { type: 'string', description: '搜索路径' },
      ignore: { type: 'array', items: { type: 'string' }, description: '忽略的模式' },
    },
    required: ['pattern'],
  },
  requiresConfirm: false,
  async execute(args) {
    const { pattern, path: searchPath = '.', ignore = [] } = args as GlobSearchArgs;
    
    try {
      const files = await glob(pattern, {
        cwd: searchPath,
        ignore: ['node_modules', '.git', ...ignore],
        absolute: true,
      });
      
      return {
        success: true,
        data: { files, count: files.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
```

#### 4.2.2 grep_search

```typescript
export const grepSearchTool: ToolDefinition = {
  name: 'grep_search',
  description: '搜索文件内容，支持正则表达式',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '搜索模式（支持正则）' },
      path: { type: 'string', description: '搜索路径' },
      include: { type: 'string', description: '包含的文件模式' },
      ignoreCase: { type: 'boolean', description: '忽略大小写' },
      maxResults: { type: 'number', description: '最大结果数' },
    },
    required: ['pattern'],
  },
  requiresConfirm: false,
  async execute(args) {
    const { pattern, path: searchPath = '.', include, ignoreCase = false, maxResults = 100 } = args as GrepSearchArgs;
    
    try {
      // 使用Node.js原生实现（避免外部依赖）
      // grepNative函数实现文件读取和正则匹配
      const results = await grepNative(pattern, {
        cwd: searchPath,
        include,
        ignoreCase,
        maxResults,
      });
      
      return {
        success: true,
        data: { results, count: results.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
```

---

## 5. 辅助函数实现

### 5.1 generateDiff函数

```typescript
// src/utils/diff.ts

export function generateDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  
  const diff: string[] = []
  const maxLines = Math.max(oldLines.length, newLines.length)
  
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    
    if (oldLine === newLine) {
      diff.push(`  ${oldLine}`)
    } else {
      if (oldLine !== undefined) {
        diff.push(`- ${oldLine}`)
      }
      if (newLine !== undefined) {
        diff.push(`+ ${newLine}`)
      }
    }
  }
  
  return diff.join('\n')
}
```

### 5.2 grepNative函数

```typescript
// src/utils/grep.ts

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

interface GrepOptions {
  cwd: string
  include?: string
  ignoreCase?: boolean
  maxResults?: number
}

interface GrepResult {
  file: string
  line: number
  content: string
}

export async function grepNative(
  pattern: string,
  options: GrepOptions
): Promise<GrepResult[]> {
  const { cwd, include, ignoreCase = false, maxResults = 100 } = options
  const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g')
  const results: GrepResult[] = []
  
  // 递归遍历目录
  async function walkDir(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      // 跳过node_modules和.git
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue
      }
      
      if (entry.isDirectory()) {
        await walkDir(fullPath)
      } else if (entry.isFile()) {
        // 检查文件匹配
        if (include && !minimatch(entry.name, include)) {
          continue
        }
        
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push({
                file: fullPath,
                line: i + 1,
                content: lines[i],
              })
              
              if (results.length >= maxResults) {
                return
              }
            }
          }
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
  }
  
  await walkDir(cwd)
  return results
}
```

---

## 6. 工具注册中心

### 5.1 ToolRegistry实现

```typescript
// src/tools/registry.ts

import type { ToolDefinition } from '../types/tool.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }
}
```

### 5.2 内置工具注册

```typescript
// src/tools/built-in/index.ts

import { ToolRegistry } from '../registry.js';
import { readFileTool, writeFileTool, editFileTool, createFileTool, deleteFileTool, listDirTool } from './file.js';
import { globSearchTool, grepSearchTool } from './search.js';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  
  // 注册文件操作工具
  registry.registerMany([
    readFileTool,
    writeFileTool,
    editFileTool,
    createFileTool,
    deleteFileTool,
    listDirTool,
  ]);
  
  // 注册搜索工具
  registry.registerMany([
    globSearchTool,
    grepSearchTool,
  ]);
  
  return registry;
}
```

---

## 6. 工具调用机制

### 6.1 集成到chat.ts

```typescript
// 在src/cli/chat.ts中修改

import { createDefaultToolRegistry } from '../tools/built-in/index.js';
import type { ToolCall } from '../types/tool.js';

export async function startChat(config: Config): Promise<void> {
  // ... 现有代码 ...
  
  const toolRegistry = createDefaultToolRegistry();
  
  // 修改消息处理逻辑
  rl.on('line', async (input: string) => {
    // ... 现有slash命令处理 ...
    
    messages.push({ role: 'user', content: trimmed })
    console.log(chalk.yellow('AI 思考中...'))
    
    try {
      const response = await provider.chat({
        messages,
        tools: toolRegistry.getToolDefinitions(),
        systemPrompt: config.systemPrompt,
      })
      
      // 处理工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        await handleToolCalls(response.toolCalls, toolRegistry, messages, config)
      }
      
      // 处理文本响应
      if (response.content) {
        messages.push({ role: 'assistant', content: response.content })
        displayResponse(response.content)
      }
      
      // ... 现有token显示 ...
    } catch (error) {
      displayError(error)
    }
    
    rl.prompt()
  })
}

async function handleToolCalls(
  toolCalls: ToolCall[],
  toolRegistry: ToolRegistry,
  messages: LLMMessage[],
  config: Config
): Promise<void> {
  for (const toolCall of toolCalls) {
    const tool = toolRegistry.get(toolCall.name)
    
    if (!tool) {
      console.log(chalk.red(`未知工具: ${toolCall.name}`))
      messages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: false, error: `未知工具: ${toolCall.name}` }),
      })
      continue
    }
    
    // 显示工具调用
    console.log(chalk.cyan(`\n─── 工具调用: ${tool.name} ───────────────────────`))
    console.log(chalk.gray(`参数: ${JSON.stringify(toolCall.args, null, 2)}`))
    
    // 安全检查
    if (tool.requiresConfirm && !config.yolo) {
      const confirmed = await userConfirm(toolCall)
      if (!confirmed) {
        console.log(chalk.yellow('用户取消操作'))
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: JSON.stringify({ success: false, error: '用户取消' }),
        })
        continue
      }
    }
    
    // 执行工具
    const result = await tool.execute(toolCall.args)
    
    // 显示结果
    if (result.success) {
      console.log(chalk.green('✓ 执行成功'))
      if (result.metadata?.diff) {
        console.log(chalk.gray('Diff:'))
        console.log(result.metadata.diff)
      }
    } else {
      console.log(chalk.red(`✗ 执行失败: ${result.error}`))
    }
    
    // 添加到消息历史
    messages.push({
      role: 'tool',
      toolCallId: toolCall.id,
      content: JSON.stringify(result),
    })
  }
}
```

### 6.2 用户确认机制

```typescript
// src/utils/confirm.ts

import * as readline from 'node:readline'
import chalk from 'chalk'
import type { ToolCall } from '../types/tool.js'

export async function userConfirm(toolCall: ToolCall): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  
  return new Promise((resolve) => {
    const message = `\n${chalk.yellow('确认执行操作?')} ${toolCall.name}\n${chalk.gray(`参数: ${JSON.stringify(toolCall.args, null, 2)}`)}\n${chalk.cyan('(y/N): ')}`
    
    rl.question(message, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}
```

---

## 7. 安全设计

### 7.1 敏感文件保护

```typescript
// src/utils/security.ts

import micromatch from 'micromatch'

const SENSITIVE_PATTERNS = [
  '**/.env*',
  '**/config*.json',
  '**/config*.yaml',
  '**/*.pem',
  '**/*.key',
  '**/*-secret*',
  '**/credentials*',
  '**/.ssh/**',
  '**/.aws/**',
]

export function isSensitivePath(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) =>
    micromatch.isMatch(filePath, pattern)
  )
}

export function requiresExtraConfirm(filePath: string): boolean {
  return isSensitivePath(filePath)
}
```

### 7.2 危险命令检测

```typescript
// 用于Phase 2的终端命令执行
const DANGEROUS_COMMANDS = [
  /^rm\s+-rf\s+\//,
  /^dd\s+/,
  /^mkfs/,
  /^:\(\)\{ :\|:&\};:/, // Fork 炸弹
  /^>\s+\/dev\/sda/,
]

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command.trim()))
}
```

---

## 8. 测试策略

### 8.1 测试驱动开发流程

对于每个工具，遵循以下流程：

1. **编写测试用例**
   - 正常情况测试
   - 边界情况测试
   - 错误情况测试

2. **运行测试（应该失败）**

3. **实现工具代码**

4. **运行测试（应该通过）**

5. **代码自审**
   - 检查代码质量
   - 检查错误处理
   - 检查安全性

6. **提交代码**

### 8.2 测试用例示例

```typescript
// tests/unit/tools/file.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileTool, editFileTool } from '../../../src/tools/built-in/file.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

describe('read_file tool', () => {
  let tempDir: string
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
  })
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  it('应该读取文件内容', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await fs.writeFile(filePath, 'Hello\nWorld\nTest')
    
    const result = await readFileTool.execute({ path: filePath })
    
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      content: 'Hello\nWorld\nTest',
      totalLines: 3,
      startLine: 1,
      endLine: 3,
    })
  })
  
  it('应该支持行范围', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await fs.writeFile(filePath, 'Line1\nLine2\nLine3\nLine4\nLine5')
    
    const result = await readFileTool.execute({ path: filePath, offset: 2, limit: 2 })
    
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      content: 'Line2\nLine3',
      totalLines: 5,
      startLine: 2,
      endLine: 3,
    })
  })
  
  it('应该处理文件不存在的情况', async () => {
    const result = await readFileTool.execute({ path: '/nonexistent/file.txt' })
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('读取文件失败')
  })
})

describe('edit_file tool', () => {
  let tempDir: string
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
  })
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  it('应该替换文本', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await fs.writeFile(filePath, 'Hello World')
    
    const result = await editFileTool.execute({
      path: filePath,
      oldString: 'World',
      newString: 'TypeScript',
    })
    
    expect(result.success).toBe(true)
    expect(result.metadata?.diff).toContain('+ Hello TypeScript')
    
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('Hello TypeScript')
  })
  
  it('应该处理未找到匹配的情况', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await fs.writeFile(filePath, 'Hello World')
    
    const result = await editFileTool.execute({
      path: filePath,
      oldString: 'Nonexistent',
      newString: 'Text',
    })
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('未找到匹配的文本')
  })
})
```

### 8.3 测试覆盖率目标

- 工具参数验证：100%
- 文件操作正确性：95%
- 错误处理：90%
- 安全确认机制：100%

---

## 9. 实现计划

### 9.1 任务拆分（TDD方式）

**任务1：实现ToolRegistry**
- 编写ToolRegistry测试
- 实现ToolRegistry
- 代码自审
- 提交

**任务2：实现read_file工具**
- 编写read_file测试
- 实现read_file
- 代码自审
- 提交

**任务3：实现edit_file工具**
- 编写edit_file测试
- 实现edit_file
- 代码自审
- 提交

**任务4：实现其他文件工具**
- 编写write_file, create_file, delete_file, list_dir测试
- 实现这些工具
- 代码自审
- 提交

**任务5：实现搜索工具**
- 编写glob_search, grep_search测试
- 实现搜索工具
- 代码自审
- 提交

**任务6：集成工具调用机制**
- 修改chat.ts集成ToolRegistry
- 实现工具调用处理
- 实现用户确认机制
- 代码自审
- 提交

**任务7：安全机制**
- 实现敏感文件保护
- 实现危险命令检测
- 编写安全测试
- 代码自审
- 提交

### 9.2 验收标准

1. 所有工具都能正常工作
2. 测试覆盖率达到目标
3. 代码自审通过
4. 能够让AI读取和编辑项目文件
5. 安全确认机制正常工作

---

## 10. 风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| 文件编码问题 | 中 | 中 | 使用utf-8编码，支持BOM检测 |
| 大文件处理 | 低 | 中 | 限制文件大小，支持流式读取 |
| 并发文件操作 | 低 | 低 | 使用文件锁，避免并发写入 |
| 跨平台路径问题 | 中 | 中 | 使用path模块，统一路径处理 |
| 正则表达式性能 | 低 | 低 | 限制搜索范围，使用ripgrep |

---

_设计文档结束_
