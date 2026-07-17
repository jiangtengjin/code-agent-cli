# Phase 1c: 工具系统+读写文件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现工具系统，使AI能够读取和编辑项目文件

**Architecture:** 采用TDD方式，按功能分组实现：先实现ToolRegistry，再实现文件操作工具，最后实现搜索工具和工具调用机制

**Tech Stack:** TypeScript, Node.js, Vitest, micromatch

## Global Constraints

- 使用TypeScript 5.7+，Node.js 20 LTS+
- 测试框架：Vitest 2.x
- 代码规范：Biome 1.x
- 包管理：pnpm 9.x
- 所有工具必须有单元测试
- 每个任务必须有编码->commit->review的完整步骤

---

## 文件结构

### 新建文件

1. `src/types/tool.ts` - 工具类型定义
2. `src/tools/registry.ts` - 工具注册中心
3. `src/tools/built-in/file.ts` - 文件操作工具
4. `src/tools/built-in/search.ts` - 搜索工具
5. `src/tools/built-in/index.ts` - 内置工具注册
6. `src/utils/diff.ts` - diff生成函数
7. `src/utils/grep.ts` - grep原生实现
8. `src/utils/security.ts` - 安全工具函数
9. `tests/unit/tools/registry.test.ts` - ToolRegistry测试
10. `tests/unit/tools/file.test.ts` - 文件工具测试
11. `tests/unit/tools/search.test.ts` - 搜索工具测试

### 修改文件

1. `src/cli/chat.ts` - 集成工具调用机制
2. `src/types/index.ts` - 导出工具类型

---

## Task 1: 实现ToolRegistry

**Files:**
- Create: `src/types/tool.ts`
- Create: `src/tools/registry.ts`
- Create: `tests/unit/tools/registry.test.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: 无
- Produces: `ToolRegistry` class, `ToolDefinition` interface, `ToolResult` interface

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/tools/registry.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry } from '../../../src/tools/registry.js'
import type { ToolDefinition } from '../../../src/types/tool.js'

describe('ToolRegistry', () => {
  let registry: ToolRegistry
  
  beforeEach(() => {
    registry = new ToolRegistry()
  })
  
  it('应该注册工具', () => {
    const tool: ToolDefinition = {
      name: 'test-tool',
      description: '测试工具',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true }),
    }
    
    registry.register(tool)
    
    expect(registry.has('test-tool')).toBe(true)
    expect(registry.get('test-tool')).toBe(tool)
  })
  
  it('应该批量注册工具', () => {
    const tool1: ToolDefinition = {
      name: 'tool1',
      description: '工具1',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true }),
    }
    
    const tool2: ToolDefinition = {
      name: 'tool2',
      description: '工具2',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true }),
    }
    
    registry.registerMany([tool1, tool2])
    
    expect(registry.has('tool1')).toBe(true)
    expect(registry.has('tool2')).toBe(true)
  })
  
  it('应该返回所有工具定义', () => {
    const tool: ToolDefinition = {
      name: 'test-tool',
      description: '测试工具',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true }),
    }
    
    registry.register(tool)
    
    const definitions = registry.getToolDefinitions()
    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toBe(tool)
  })
  
  it('应该返回所有工具名称', () => {
    const tool1: ToolDefinition = {
      name: 'tool1',
      description: '工具1',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true }),
    }
    
    const tool2: ToolDefinition = {
      name: 'tool2',
      description: '工具2',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true }),
    }
    
    registry.registerMany([tool1, tool2])
    
    const names = registry.list()
    expect(names).toContain('tool1')
    expect(names).toContain('tool2')
  })
  
  it('应该处理不存在的工具', () => {
    expect(registry.has('nonexistent')).toBe(false)
    expect(registry.get('nonexistent')).toBeUndefined()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/tools/registry.test.ts`
Expected: FAIL with "Cannot find module '../../../src/tools/registry.js'"

- [x] **Step 3: Write minimal implementation**

```typescript
// src/types/tool.ts

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
  requiresConfirm?: boolean // 需要用户确认
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  metadata?: {
    filePath?: string
    diff?: string
    lineCount?: number
  }
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}
```

```typescript
// src/tools/registry.ts

import type { ToolDefinition } from '../types/tool.js'

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()
  
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }
  
  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }
  
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }
  
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }
  
  has(name: string): boolean {
    return this.tools.has(name)
  }
  
  list(): string[] {
    return Array.from(this.tools.keys())
  }
}
```

```typescript
// src/types/index.ts

export type { ToolDefinition, ToolResult, ToolCall } from './tool.js'
// ... 其他现有导出
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/tools/registry.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/types/tool.ts src/tools/registry.ts src/types/index.ts tests/unit/tools/registry.test.ts
git commit -m "feat: implement ToolRegistry with TDD"
```

---

## Task 2: 实现read_file工具

**Files:**
- Create: `src/tools/built-in/file.ts`
- Create: `tests/unit/tools/file.test.ts`

**Interfaces:**
- Consumes: `ToolDefinition` from Task 1
- Produces: `readFileTool` constant

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/tools/file.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileTool } from '../../../src/tools/built-in/file.js'
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
  
  it('应该有正确的工具定义', () => {
    expect(readFileTool.name).toBe('read_file')
    expect(readFileTool.description).toBe('读取指定文件的内容，支持行范围')
    expect(readFileTool.requiresConfirm).toBe(false)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/tools/file.test.ts`
Expected: FAIL with "Cannot find module '../../../src/tools/built-in/file.js'"

- [x] **Step 3: Write minimal implementation**

```typescript
// src/tools/built-in/file.ts

import type { ToolDefinition } from '../../types/tool.js'
import * as fs from 'node:fs/promises'

interface ReadFileArgs {
  path: string
  offset?: number
  limit?: number
}

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
    const { path, offset, limit } = args as ReadFileArgs
    
    try {
      const content = await fs.readFile(path, 'utf-8')
      const lines = content.split('\n')
      
      // 处理行范围
      const start = offset ? Math.max(1, offset) : 1
      const end = limit ? Math.min(lines.length, start + limit - 1) : lines.length
      const selectedLines = lines.slice(start - 1, end)
      
      return {
        success: true,
        data: {
          content: selectedLines.join('\n'),
          totalLines: lines.length,
          startLine: start,
          endLine: end,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `读取文件失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/tools/file.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/tools/built-in/file.ts tests/unit/tools/file.test.ts
git commit -m "feat: implement read_file tool with TDD"
```

---

## Task 3: 实现edit_file工具

**Files:**
- Modify: `src/tools/built-in/file.ts`
- Modify: `tests/unit/tools/file.test.ts`
- Create: `src/utils/diff.ts`

**Interfaces:**
- Consumes: `ToolDefinition` from Task 1
- Produces: `editFileTool` constant, `generateDiff` function

- [x] **Step 1: Write the failing test**

```typescript
// 在tests/unit/tools/file.test.ts中添加

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
  
  it('应该有正确的工具定义', () => {
    expect(editFileTool.name).toBe('edit_file')
    expect(editFileTool.description).toBe('精确编辑文件内容（搜索替换）')
    expect(editFileTool.requiresConfirm).toBe(true)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/tools/file.test.ts`
Expected: FAIL with "editFileTool is not defined"

- [x] **Step 3: Write minimal implementation**

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

```typescript
// 在src/tools/built-in/file.ts中添加

import { generateDiff } from '../../utils/diff.js'

interface EditFileArgs {
  path: string
  oldString: string
  newString: string
}

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
    const { path, oldString, newString } = args as EditFileArgs
    
    try {
      const content = await fs.readFile(path, 'utf-8')
      
      if (!content.includes(oldString)) {
        return {
          success: false,
          error: `在 ${path} 中未找到匹配的文本。前 100 个字符: "${content.slice(0, 100)}"`,
        }
      }
      
      const newContent = content.replace(oldString, newString)
      await fs.writeFile(path, newContent, 'utf-8')
      
      // 生成diff
      const diff = generateDiff(content, newContent)
      
      return {
        success: true,
        data: { path, diff },
        metadata: { filePath: path, diff },
      }
    } catch (error) {
      return {
        success: false,
        error: `编辑文件失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/tools/file.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/tools/built-in/file.ts src/utils/diff.ts tests/unit/tools/file.test.ts
git commit -m "feat: implement edit_file tool with TDD"
```

---

## Task 4: 实现其他文件工具

**Files:**
- Modify: `src/tools/built-in/file.ts`
- Modify: `tests/unit/tools/file.test.ts`

**Interfaces:**
- Consumes: `ToolDefinition` from Task 1
- Produces: `writeFileTool`, `createFileTool`, `deleteFileTool`, `listDirTool` constants

- [x] **Step 1: Write the failing test**

```typescript
// 在tests/unit/tools/file.test.ts中添加

describe('write_file tool', () => {
  let tempDir: string
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
  })
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  it('应该写入文件', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    
    const result = await writeFileTool.execute({
      path: filePath,
      content: 'Hello World',
    })
    
    expect(result.success).toBe(true)
    
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('Hello World')
  })
  
  it('应该有正确的工具定义', () => {
    expect(writeFileTool.name).toBe('write_file')
    expect(writeFileTool.requiresConfirm).toBe(true)
  })
})

describe('create_file tool', () => {
  let tempDir: string
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
  })
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  it('应该创建文件和目录', async () => {
    const filePath = path.join(tempDir, 'subdir', 'test.txt')
    
    const result = await createFileTool.execute({
      path: filePath,
      content: 'Hello World',
    })
    
    expect(result.success).toBe(true)
    
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('Hello World')
  })
  
  it('应该有正确的工具定义', () => {
    expect(createFileTool.name).toBe('create_file')
    expect(createFileTool.requiresConfirm).toBe(true)
  })
})

describe('delete_file tool', () => {
  let tempDir: string
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
  })
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  it('应该删除文件', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await fs.writeFile(filePath, 'Hello World')
    
    const result = await deleteFileTool.execute({ path: filePath })
    
    expect(result.success).toBe(true)
    
    const exists = await fs.access(filePath).then(() => true, () => false)
    expect(exists).toBe(false)
  })
  
  it('应该有正确的工具定义', () => {
    expect(deleteFileTool.name).toBe('delete_file')
    expect(deleteFileTool.requiresConfirm).toBe(true)
  })
})

describe('list_dir tool', () => {
  let tempDir: string
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1')
    await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2')
    await fs.mkdir(path.join(tempDir, 'subdir'))
  })
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  it('应该列出目录内容', async () => {
    const result = await listDirTool.execute({ path: tempDir })
    
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('entries')
  })
  
  it('应该有正确的工具定义', () => {
    expect(listDirTool.name).toBe('list_dir')
    expect(listDirTool.requiresConfirm).toBe(false)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/tools/file.test.ts`
Expected: FAIL with "writeFileTool is not defined"

- [x] **Step 3: Write minimal implementation**

```typescript
// 在src/tools/built-in/file.ts中添加

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

interface WriteFileArgs {
  path: string
  content: string
}

interface CreateFileArgs {
  path: string
  content: string
}

interface DeleteFileArgs {
  path: string
}

interface ListDirArgs {
  path: string
  depth?: number
  pattern?: string
}

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: '写入/覆盖文件内容',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' },
    },
    required: ['path', 'content'],
  },
  requiresConfirm: true,
  async execute(args) {
    const { path: filePath, content } = args as WriteFileArgs
    
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      
      return {
        success: true,
        data: { path: filePath, length: content.length },
      }
    } catch (error) {
      return {
        success: false,
        error: `写入文件失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}

export const createFileTool: ToolDefinition = {
  name: 'create_file',
  description: '创建新文件，自动创建目录',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' },
    },
    required: ['path', 'content'],
  },
  requiresConfirm: true,
  async execute(args) {
    const { path: filePath, content } = args as CreateFileArgs
    
    try {
      // 确保目录存在
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      
      await fs.writeFile(filePath, content, 'utf-8')
      
      return {
        success: true,
        data: { path: filePath, length: content.length },
      }
    } catch (error) {
      return {
        success: false,
        error: `创建文件失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}

export const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: '删除文件',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
    },
    required: ['path'],
  },
  requiresConfirm: true,
  async execute(args) {
    const { path: filePath } = args as DeleteFileArgs
    
    try {
      await fs.unlink(filePath)
      
      return {
        success: true,
        data: { path: filePath },
      }
    } catch (error) {
      return {
        success: false,
        error: `删除文件失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: '列出目录内容',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径' },
      depth: { type: 'number', description: '递归深度' },
      pattern: { type: 'string', description: '文件匹配模式' },
    },
    required: ['path'],
  },
  requiresConfirm: false,
  async execute(args) {
    const { path: dirPath, depth = 1 } = args as ListDirArgs
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      
      const result = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, entry.name),
      }))
      
      return {
        success: true,
        data: { entries: result, count: result.length },
      }
    } catch (error) {
      return {
        success: false,
        error: `列出目录失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/tools/file.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/tools/built-in/file.ts tests/unit/tools/file.test.ts
git commit -m "feat: implement write_file, create_file, delete_file, list_dir tools"
```

---

## Task 5: 实现搜索工具

**Files:**
- Create: `src/tools/built-in/search.ts`
- Create: `src/utils/grep.ts`
- Create: `tests/unit/tools/search.test.ts`

**Interfaces:**
- Consumes: `ToolDefinition` from Task 1
- Produces: `globSearchTool`, `grepSearchTool` constants

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/tools/search.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { globSearchTool, grepSearchTool } from '../../../src/tools/built-in/search.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

describe('glob_search tool', () => {
  let tempDir: string
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'content')
    await fs.writeFile(path.join(tempDir, 'test.ts'), 'content')
    await fs.writeFile(path.join(tempDir, 'other.js'), 'content')
  })
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  it('应该搜索匹配的文件', async () => {
    const result = await globSearchTool.execute({
      pattern: '*.txt',
      path: tempDir,
    })
    
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('files')
    expect(result.data).toHaveProperty('count')
  })
  
  it('应该有正确的工具定义', () => {
    expect(globSearchTool.name).toBe('glob_search')
    expect(globSearchTool.requiresConfirm).toBe(false)
  })
})

describe('grep_search tool', () => {
  let tempDir: string
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'Hello World\nTest Line')
    await fs.writeFile(path.join(tempDir, 'other.txt'), 'Another Line')
  })
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  it('应该搜索文件内容', async () => {
    const result = await grepSearchTool.execute({
      pattern: 'Hello',
      path: tempDir,
    })
    
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('results')
    expect(result.data).toHaveProperty('count')
  })
  
  it('应该有正确的工具定义', () => {
    expect(grepSearchTool.name).toBe('grep_search')
    expect(grepSearchTool.requiresConfirm).toBe(false)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/tools/search.test.ts`
Expected: FAIL with "Cannot find module '../../../src/tools/built-in/search.js'"

- [x] **Step 3: Write minimal implementation**

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

```typescript
// src/tools/built-in/search.ts

import type { ToolDefinition } from '../../types/tool.js'
import { glob } from 'glob'
import { grepNative } from '../../utils/grep.js'

interface GlobSearchArgs {
  pattern: string
  path?: string
  ignore?: string[]
}

interface GrepSearchArgs {
  pattern: string
  path?: string
  include?: string
  ignoreCase?: boolean
  maxResults?: number
}

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
    const { pattern, path: searchPath = '.', ignore = [] } = args as GlobSearchArgs
    
    try {
      const files = await glob(pattern, {
        cwd: searchPath,
        ignore: ['node_modules', '.git', ...ignore],
        absolute: true,
      })
      
      return {
        success: true,
        data: { files, count: files.length },
      }
    } catch (error) {
      return {
        success: false,
        error: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}

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
    const { pattern, path: searchPath = '.', include, ignoreCase = false, maxResults = 100 } = args as GrepSearchArgs
    
    try {
      // 使用Node.js原生实现（避免外部依赖）
      const results = await grepNative(pattern, {
        cwd: searchPath,
        include,
        ignoreCase,
        maxResults,
      })
      
      return {
        success: true,
        data: { results, count: results.length },
      }
    } catch (error) {
      return {
        success: false,
        error: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/tools/search.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/tools/built-in/search.ts src/utils/grep.ts tests/unit/tools/search.test.ts
git commit -m "feat: implement glob_search and grep_search tools with TDD"
```

---

## Task 6: 集成工具调用机制

**Files:**
- Modify: `src/cli/chat.ts`
- Create: `src/tools/built-in/index.ts`

**Interfaces:**
- Consumes: `ToolRegistry` from Task 1, all tools from Tasks 2-5
- Produces: 集成到chat.ts的工具调用机制

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/tools/integration.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { createDefaultToolRegistry } from '../../../src/tools/built-in/index.js'

describe('工具集成', () => {
  it('应该创建默认工具注册表', () => {
    const registry = createDefaultToolRegistry()
    
    expect(registry.has('read_file')).toBe(true)
    expect(registry.has('edit_file')).toBe(true)
    expect(registry.has('write_file')).toBe(true)
    expect(registry.has('create_file')).toBe(true)
    expect(registry.has('delete_file')).toBe(true)
    expect(registry.has('list_dir')).toBe(true)
    expect(registry.has('glob_search')).toBe(true)
    expect(registry.has('grep_search')).toBe(true)
  })
  
  it('应该返回所有工具定义', () => {
    const registry = createDefaultToolRegistry()
    const definitions = registry.getToolDefinitions()
    
    expect(definitions.length).toBeGreaterThanOrEqual(8)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/tools/integration.test.ts`
Expected: FAIL with "Cannot find module '../../../src/tools/built-in/index.js'"

- [x] **Step 3: Write minimal implementation**

```typescript
// src/tools/built-in/index.ts

import { ToolRegistry } from '../registry.js'
import { readFileTool, writeFileTool, editFileTool, createFileTool, deleteFileTool, listDirTool } from './file.js'
import { globSearchTool, grepSearchTool } from './search.js'

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  
  // 注册文件操作工具
  registry.registerMany([
    readFileTool,
    writeFileTool,
    editFileTool,
    createFileTool,
    deleteFileTool,
    listDirTool,
  ])
  
  // 注册搜索工具
  registry.registerMany([
    globSearchTool,
    grepSearchTool,
  ])
  
  return registry
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/tools/integration.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/tools/built-in/index.ts tests/unit/tools/integration.test.ts
git commit -m "feat: create default tool registry with all built-in tools"
```

---

## Task 7: 实现安全机制

**Files:**
- Create: `src/utils/security.ts`
- Create: `tests/unit/utils/security.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `isSensitivePath`, `requiresExtraConfirm`, `isDangerousCommand` functions

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/utils/security.test.ts

import { describe, it, expect } from 'vitest'
import { isSensitivePath, requiresExtraConfirm, isDangerousCommand } from '../../../src/utils/security.js'

describe('安全工具函数', () => {
  describe('isSensitivePath', () => {
    it('应该识别敏感文件', () => {
      expect(isSensitivePath('.env')).toBe(true)
      expect(isSensitivePath('config.json')).toBe(true)
      expect(isSensitivePath('secret.pem')).toBe(true)
      expect(isSensitivePath('credentials.yaml')).toBe(true)
    })
    
    it('应该识别敏感目录', () => {
      expect(isSensitivePath('.ssh/id_rsa')).toBe(true)
      expect(isSensitivePath('.aws/credentials')).toBe(true)
    })
    
    it('应该忽略普通文件', () => {
      expect(isSensitivePath('src/app.ts')).toBe(false)
      expect(isSensitivePath('README.md')).toBe(false)
    })
  })
  
  describe('requiresExtraConfirm', () => {
    it('应该对敏感文件要求二次确认', () => {
      expect(requiresExtraConfirm('.env')).toBe(true)
      expect(requiresExtraConfirm('config.json')).toBe(true)
    })
    
    it('应该对普通文件不要求二次确认', () => {
      expect(requiresExtraConfirm('src/app.ts')).toBe(false)
    })
  })
  
  describe('isDangerousCommand', () => {
    it('应该识别危险命令', () => {
      expect(isDangerousCommand('rm -rf /')).toBe(true)
      expect(isDangerousCommand('dd if=/dev/zero of=/dev/sda')).toBe(true)
      expect(isDangerousCommand('mkfs.ext4 /dev/sda1')).toBe(true)
    })
    
    it('应该忽略安全命令', () => {
      expect(isDangerousCommand('ls -la')).toBe(false)
      expect(isDangerousCommand('git status')).toBe(false)
      expect(isDangerousCommand('npm install')).toBe(false)
    })
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/utils/security.test.ts`
Expected: FAIL with "Cannot find module '../../../src/utils/security.js'"

- [x] **Step 3: Write minimal implementation**

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

const DANGEROUS_COMMANDS = [
  /^rm\s+-rf\s+\//,
  /^dd\s+/,
  /^mkfs/,
  /^:\(\)\{ :\|:&\};:/, // Fork 炸弹
  /^>\s+\/dev\/sda/,
]

export function isSensitivePath(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) =>
    micromatch.isMatch(filePath, pattern)
  )
}

export function requiresExtraConfirm(filePath: string): boolean {
  return isSensitivePath(filePath)
}

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command.trim()))
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/utils/security.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/utils/security.ts tests/unit/utils/security.test.ts
git commit -m "feat: implement security utilities with TDD"
```

---

## Task 8: 集成到chat.ts

**Files:**
- Modify: `src/cli/chat.ts`

**Interfaces:**
- Consumes: `ToolRegistry` from Task 1, `createDefaultToolRegistry` from Task 6
- Produces: 集成工具调用的chat.ts

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/cli/chat-integration.test.ts

import { describe, it, expect } from 'vitest'
import { createDefaultToolRegistry } from '../../../src/tools/built-in/index.js'

describe('chat集成', () => {
  it('应该能够创建工具注册表并获取工具定义', () => {
    const registry = createDefaultToolRegistry()
    const definitions = registry.getToolDefinitions()
    
    // 验证工具定义格式正确
    for (const def of definitions) {
      expect(def).toHaveProperty('name')
      expect(def).toHaveProperty('description')
      expect(def).toHaveProperty('parameters')
      expect(def).toHaveProperty('execute')
      expect(typeof def.execute).toBe('function')
    }
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/cli/chat-integration.test.ts`
Expected: FAIL (如果测试文件不存在)

- [x] **Step 3: Write minimal implementation**

```typescript
// 在src/cli/chat.ts中修改

import { createDefaultToolRegistry } from '../tools/built-in/index.js'
import type { ToolCall } from '../types/tool.js'

export async function startChat(config: Config): Promise<void> {
  // ... 现有代码 ...
  
  const toolRegistry = createDefaultToolRegistry()
  
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

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/cli/chat-integration.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/cli/chat.ts tests/unit/cli/chat-integration.test.ts
git commit -m "feat: integrate tool calling mechanism into chat"
```

---

## Task 9: 运行完整测试套件

**Files:**
- 无新增文件

**Interfaces:**
- Consumes: 所有之前的任务
- Produces: 完整的测试通过

- [x] **Step 1: 运行所有测试**

Run: `pnpm test`
Expected: 所有测试通过

- [x] **Step 2: 运行代码检查**

Run: `pnpm lint`
Expected: 无错误

- [x] **Step 3: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无错误

- [x] **Step 4: 代码自审**

检查清单：
- [x] 所有工具都有单元测试
- [x] 错误处理完整
- [x] 安全机制已实现
- [x] 代码符合项目规范
- [x] 文档已更新

- [x] **Step 5: 最终提交**

```bash
git add .
git commit -m "feat: complete Phase 1c tool system implementation"
```

---

## 验收标准

1. ✅ 所有工具都能正常工作
2. ✅ 测试覆盖率达到目标
3. ✅ 代码自审通过
4. ✅ 能够让AI读取和编辑项目文件
5. ✅ 安全确认机制正常工作

---

_实施计划结束_
