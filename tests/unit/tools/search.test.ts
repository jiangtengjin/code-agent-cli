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
