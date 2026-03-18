import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTeleportJsonlRecord,
  buildClaudeMdContent,
  buildTmuxCommand,
  buildJsonlAppendCommand,
  buildClaudeMdCommand,
} from '../../src/cli/launch.js'

describe('buildTeleportJsonlRecord', () => {
  it('creates valid JSONL record with teleport message', () => {
    const record = buildTeleportJsonlRecord({
      sessionId: 'test-session',
      ccVersion: '2.1.78',
      sourceDir: 'D:\\NEOCORTICA-SESSION',
      targetDir: '/workspace',
    })

    const parsed = JSON.parse(record)
    assert.equal(parsed.type, 'user')
    assert.equal(parsed.sessionId, 'test-session')
    assert.equal(parsed.version, '2.1.78')
    assert.ok(parsed.message.content.includes('[Session Teleported]'))
    assert.ok(parsed.message.content.includes('D:\\NEOCORTICA-SESSION'))
    assert.ok(parsed.message.content.includes('/workspace'))
    assert.ok(parsed.uuid)
    assert.ok(parsed.timestamp)
  })
})

describe('buildClaudeMdContent', () => {
  it('generates teleport notice', () => {
    const content = buildClaudeMdContent('D:\\PROJECT', '/workspace')
    assert.ok(content.includes('Teleported Session'))
    assert.ok(content.includes('D:\\PROJECT'))
    assert.ok(content.includes('/workspace'))
    assert.ok(content.includes('Do NOT continue'))
  })
})

describe('buildTmuxCommand', () => {
  it('builds tmux + claude resume command', () => {
    const cmd = buildTmuxCommand('test-session', '/workspace')
    assert.ok(cmd.includes('tmux kill-session -t neocortica'))
    assert.ok(cmd.includes('tmux new-session -d -s neocortica'))
    assert.ok(cmd.includes('cd /workspace'))
    assert.ok(cmd.includes('claude --resume test-session'))
  })
})

describe('buildJsonlAppendCommand', () => {
  it('builds echo append command for remote JSONL', () => {
    const record = '{"type":"user"}'
    const cmd = buildJsonlAppendCommand(record, '-workspace', 'test-session')
    assert.ok(cmd.includes('.claude/projects/-workspace/test-session.jsonl'))
  })
})

describe('buildClaudeMdCommand', () => {
  it('builds command to write/append CLAUDE.md', () => {
    const content = '# Teleported Session\ntest'
    const cmd = buildClaudeMdCommand(content, '/workspace')
    assert.ok(cmd.includes('CLAUDE.md'))
    assert.ok(cmd.includes('/workspace'))
  })
})
