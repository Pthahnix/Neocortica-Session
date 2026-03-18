import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

import type { TeleportContext } from '../core/types.js'
import { assertSafeShellArg } from './teleport.js'

const execFileAsync = promisify(execFile)

export interface TeleportRecordOptions {
  sessionId: string
  ccVersion: string
  sourceDir: string
  targetDir: string
}

export function buildTeleportJsonlRecord(opts: TeleportRecordOptions): string {
  const record = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        '[Session Teleported]',
        'This session was teleported to a new environment.',
        `- Previous workspace: ${opts.sourceDir}`,
        `- Current workspace: ${opts.targetDir}`,
        '- Previous operations are no longer relevant to this environment.',
        'Await user instructions.',
      ].join('\n'),
    },
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: opts.sessionId,
    version: opts.ccVersion,
  }
  return JSON.stringify(record)
}

export function buildClaudeMdContent(sourceDir: string, targetDir: string): string {
  return [
    '',
    '# Teleported Session',
    '',
    'This session was teleported from another machine.',
    `- Source: ${sourceDir}`,
    `- Target: ${targetDir}`,
    '- Do NOT continue previous tool calls or operations.',
    '- The local environment has changed. Await user instructions.',
    '',
  ].join('\n')
}

export function buildTmuxCommand(sessionId: string, workspaceDir: string): string {
  assertSafeShellArg(sessionId, 'sessionId')
  return `tmux kill-session -t neocortica 2>/dev/null; tmux new-session -d -s neocortica "cd ${workspaceDir} && claude --resume ${sessionId}"`
}

export function buildJsonlAppendCommand(
  jsonRecord: string,
  remoteHash: string,
  sessionId: string
): string {
  assertSafeShellArg(remoteHash, 'remoteHash')
  assertSafeShellArg(sessionId, 'sessionId')
  const jsonlPath = `~/.claude/projects/${remoteHash}/${sessionId}.jsonl`
  return `cat >> ${jsonlPath} << 'JSONL_EOF'\n${jsonRecord}\nJSONL_EOF`
}

export function buildClaudeMdCommand(content: string, workspaceDir: string): string {
  return `cat >> ${workspaceDir}/CLAUDE.md << 'CLAUDEMD_EOF'\n${content}\nCLAUDEMD_EOF`
}

function sshCmd(host: string, port: number, user: string, remoteCmd: string): string[] {
  const target = `${user}@${host}`
  if (port !== 22) return ['ssh', '-o', 'StrictHostKeyChecking=no', '-p', String(port), target, remoteCmd]
  return ['ssh', '-o', 'StrictHostKeyChecking=no', target, remoteCmd]
}

export async function launch(ctx: TeleportContext): Promise<void> {
  const { host, port, sessionId, ccVersion, projectDir, workspaceDir, remoteHash } = ctx

  console.log('[launch] Injecting teleport context...')
  const jsonRecord = buildTeleportJsonlRecord({
    sessionId,
    ccVersion,
    sourceDir: projectDir,
    targetDir: workspaceDir,
  })
  const appendCmd = buildJsonlAppendCommand(jsonRecord, remoteHash, sessionId)
  const sshAppend = sshCmd(host, port, 'cc', appendCmd)
  await execFileAsync(sshAppend[0], sshAppend.slice(1))

  console.log('[launch] Writing remote CLAUDE.md...')
  const claudeMd = buildClaudeMdContent(projectDir, workspaceDir)
  const mdCmd = buildClaudeMdCommand(claudeMd, workspaceDir)
  const sshMd = sshCmd(host, port, 'cc', mdCmd)
  await execFileAsync(sshMd[0], sshMd.slice(1))

  console.log('[launch] Starting Claude Code in tmux...')
  const tmuxCmd = buildTmuxCommand(sessionId, workspaceDir)
  const sshTmux = sshCmd(host, port, 'cc', tmuxCmd)
  await execFileAsync(sshTmux[0], sshTmux.slice(1))

  console.log(`\n[ok] Session teleported! Connect with:`)
  console.log(`  ssh -p ${port} cc@${host}`)
  console.log(`  tmux attach -t neocortica`)
}
