import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  parsePodSsh,
  assertSafeShellArg,
  sshCommand,
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

  it('throws on missing @', () => {
    assert.throws(() => parsePodSsh('nope'), /Invalid SSH/)
  })
})

describe('assertSafeShellArg', () => {
  it('accepts valid strings', () => {
    assert.doesNotThrow(() => assertSafeShellArg('abc-123_test.session', 'test'))
    assert.doesNotThrow(() => assertSafeShellArg('-workspace', 'hash'))
    assert.doesNotThrow(() => assertSafeShellArg('D--NEOCORTICA', 'hash'))
  })

  it('rejects unsafe strings', () => {
    assert.throws(() => assertSafeShellArg('hello world', 'test'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('foo;rm -rf /', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('$(whoami)', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('', 'id'), /Unsafe/)
    assert.throws(() => assertSafeShellArg('../etc/passwd', 'id'), /Unsafe/)
  })
})

describe('sshCommand', () => {
  it('builds ssh command without port', () => {
    const cmd = sshCommand({ user: 'root', host: '10.0.0.1' }, 'ls')
    assert.deepEqual(cmd, ['ssh', 'root@10.0.0.1', 'ls'])
  })

  it('builds ssh command with port', () => {
    const cmd = sshCommand({ user: 'cc', host: '10.0.0.1', port: '2222' }, 'ls')
    assert.deepEqual(cmd, ['ssh', '-p', '2222', 'cc@10.0.0.1', 'ls'])
  })
})
