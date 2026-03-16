import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { remapPaths } from '../../src/core/remapper.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'remapper-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('remapPaths', () => {
  it('replaces forward-slash paths in JSONL', async () => {
    const jsonlContent = [
      JSON.stringify({ cwd: '/home/alice/project', type: 'user' }),
      JSON.stringify({ cwd: '/home/alice/project', type: 'assistant' }),
    ].join('\n')
    await writeFile(join(tempDir, 'session.jsonl'), jsonlContent)

    await remapPaths(tempDir, '/home/alice/project', '/workspace')

    const result = await readFile(join(tempDir, 'session.jsonl'), 'utf-8')
    const lines = result.trim().split('\n').map(l => JSON.parse(l))
    assert.equal(lines[0].cwd, '/workspace')
    assert.equal(lines[1].cwd, '/workspace')
  })

  it('replaces Windows backslash paths (escaped in JSON)', async () => {
    // In JSON, D:\NEOCORTICA is stored as D:\\NEOCORTICA
    const jsonlContent = JSON.stringify({ cwd: 'D:\\NEOCORTICA', type: 'user' })
    await writeFile(join(tempDir, 'session.jsonl'), jsonlContent)

    await remapPaths(tempDir, 'D:\\NEOCORTICA', '/workspace')

    const result = await readFile(join(tempDir, 'session.jsonl'), 'utf-8')
    const parsed = JSON.parse(result)
    assert.equal(parsed.cwd, '/workspace')
  })

  it('replaces paths in nested JSON files', async () => {
    const indexContent = JSON.stringify({
      version: 1,
      entries: [{
        fullPath: '/home/alice/project/session.jsonl',
        projectPath: '/home/alice/project',
      }],
    })
    await writeFile(join(tempDir, 'sessions-index.json'), indexContent)

    await remapPaths(tempDir, '/home/alice/project', '/workspace')

    const result = JSON.parse(await readFile(join(tempDir, 'sessions-index.json'), 'utf-8'))
    assert.equal(result.entries[0].fullPath, '/workspace/session.jsonl')
    assert.equal(result.entries[0].projectPath, '/workspace')
  })

  it('handles double-backslash escaping in JSON strings', async () => {
    // In the raw file: {"cwd":"D:\\NEOCORTICA",...}
    // JSON.parse yields cwd = "D:\NEOCORTICA" (single backslash)
    // The remapper must find "D:\\NEOCORTICA" in raw file content (the JSON-escaped form)
    // and replace with "/workspace"
    const raw = '{"cwd":"D:\\\\NEOCORTICA","type":"user"}\n'
    await writeFile(join(tempDir, 'session.jsonl'), raw)

    await remapPaths(tempDir, 'D:\\NEOCORTICA', '/workspace')

    const result = await readFile(join(tempDir, 'session.jsonl'), 'utf-8')
    const parsed = JSON.parse(result.trim())
    assert.equal(parsed.cwd, '/workspace')
  })

  it('processes files in subdirectories', async () => {
    const subDir = join(tempDir, 'sub', 'agents')
    await mkdir(subDir, { recursive: true })
    await writeFile(join(subDir, 'agent.jsonl'), JSON.stringify({ cwd: '/old/path' }))

    await remapPaths(tempDir, '/old/path', '/new/path')

    const result = JSON.parse(await readFile(join(subDir, 'agent.jsonl'), 'utf-8'))
    assert.equal(result.cwd, '/new/path')
  })

  it('does nothing when source and target are the same', async () => {
    const content = JSON.stringify({ cwd: '/workspace' })
    await writeFile(join(tempDir, 'session.jsonl'), content)

    await remapPaths(tempDir, '/workspace', '/workspace')

    const result = await readFile(join(tempDir, 'session.jsonl'), 'utf-8')
    assert.equal(result, content)
  })

  it('handles paths with special regex characters', async () => {
    const content = JSON.stringify({ cwd: 'C:\\Users\\Dev (1)\\app' })
    await writeFile(join(tempDir, 'session.jsonl'), content)

    await remapPaths(tempDir, 'C:\\Users\\Dev (1)\\app', '/workspace')

    const result = JSON.parse(await readFile(join(tempDir, 'session.jsonl'), 'utf-8'))
    assert.equal(result.cwd, '/workspace')
  })
})
