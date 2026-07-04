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

  it('应该有正确的工具定义', () => {
    expect(readFileTool.name).toBe('read_file')
    expect(readFileTool.description).toBe('读取指定文件的内容，支持行范围')
    expect(readFileTool.requiresConfirm).toBe(false)
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

  it('应该替换所有匹配的文本', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await fs.writeFile(filePath, 'a b a b a')

    const result = await editFileTool.execute({
      path: filePath,
      oldString: 'a',
      newString: 'c',
    })

    expect(result.success).toBe(true)
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('c b c b c')
  })

  it('应该有正确的工具定义', () => {
    expect(editFileTool.name).toBe('edit_file')
    expect(editFileTool.description).toBe('精确编辑文件内容（搜索替换）')
    expect(editFileTool.requiresConfirm).toBe(true)
  })
})
