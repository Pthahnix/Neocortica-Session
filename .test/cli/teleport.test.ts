import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildScpUploadCommand,
  buildRemoteUnpackCommands,
  buildTmuxLaunchCommand,
  parsePodSsh,
  assertSafeShellArg,
} from '../../src/cli/teleport.js'

describe('parsePodSsh', () => {
  it('parses simple user@host', () => {
    const result = parsePodSsh('root@10.0.0.1')
    assert.equal(result.user, 'root')
    assert.equal(result.host, '10.0.0.1')
    assert.equal(result.port, undefined)
  })

  it('parses user@host with port', () => {
    const result = parsePodSsh('root@10.0.0.1:2222')
    assert.equal(result.user, 'root')
    assert.equal(result.host, '10.0.0.1')
    assert.equal(result.port, '2222')
  })
})

describe('assertSafeShellArg', () => {
  it('accepts valid alphanumeric strings', () => {
    assert.doesNotThrow(() => assertSafeShellArg('abc-123_test.session', 'test'))
  })

  it('accepts hashes from computeProjectHash', () => {
    assert.doesNotThrow(() => assertSafeShellArg('-workspace', 'hash'))
    assert.doesNotThrow(() => assertSafeShellArg('D--NEOCORTICA', 'hash'))
  })

  it('rejects strings with spaces', () => {
    assert.throws(
      () => assertSafeShellArg('hello world', 'test'),
      /Unsafe test.*invalid characters/
    )
  })

  it('rejects strings with shell metacharacters', () => {
    assert.throws(() => assertSafeShellArg('foo;rm -rf /', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('$(whoami)', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('foo`cmd`', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('a&b', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('a|b', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg("a'b", 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('a"b', 'id'), /Unsafe/)
  })

  it('rejects empty strings', () => {
    assert.throws(() => assertSafeShellArg('', 'id'), /Unsafe/)
  })

  it('rejects strings with path separators', () => {
    assert.throws(() => assertSafeShellArg('../etc/passwd', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('foo/bar', 'id'), /Unsafe/)
  })
})

describe('buildScpUploadCommand', () => {
  it('builds scp command without port', () => {
    const cmd = buildScpUploadCommand('/tmp/archive.tar.gz', { user: 'root', host: '10.0.0.1' })
    assert.deepEqual(cmd, ['scp', '/tmp/archive.tar.gz', 'root@10.0.0.1:/tmp/neocortica-session.tar.gz'])
  })

  it('builds scp command with port', () => {
    const cmd = buildScpUploadCommand('/tmp/archive.tar.gz', { user: 'root', host: '10.0.0.1', port: '2222' })
    assert.deepEqual(cmd, ['scp', '-P', '2222', '/tmp/archive.tar.gz', 'root@10.0.0.1:/tmp/neocortica-session.tar.gz'])
  })
})

describe('buildRemoteUnpackCommands', () => {
  it('builds SSH commands to unpack and register session', () => {
    const cmds = buildRemoteUnpackCommands(
      '-workspace',
      'test-session-123',
    )
    assert.ok(cmds.includes('mkdir -p'))
    assert.ok(cmds.includes('tar xzf'))
    assert.ok(cmds.includes('.claude/projects/-workspace'))
  })

  it('rejects unsafe targetHash', () => {
    assert.throws(
      () => buildRemoteUnpackCommands('foo;rm -rf /', 'session-1'),
      /Unsafe/
    )
  })

  it('rejects unsafe sessionId', () => {
    assert.throws(
      () => buildRemoteUnpackCommands('-workspace', '$(whoami)'),
      /Unsafe/
    )
  })
})

describe('buildTmuxLaunchCommand', () => {
  it('builds tmux + claude resume command', () => {
    const cmd = buildTmuxLaunchCommand('test-session', '/workspace')
    assert.ok(cmd.includes('tmux kill-session'))
    assert.ok(cmd.includes('tmux new-session'))
    assert.ok(cmd.includes('cd /workspace'))
    assert.ok(cmd.includes('claude --resume test-session --fork-session'))
  })

  it('rejects unsafe sessionId', () => {
    assert.throws(
      () => buildTmuxLaunchCommand('foo;bar', '/workspace'),
      /Unsafe/
    )
  })
})
