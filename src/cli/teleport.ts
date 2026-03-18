import { computeProjectHash, CC_PROJECTS_DIR } from '../core/types.js'
import { loadEnvCredentials } from '../core/env.js'
import { parseArgs, applyMsysGuard, resolveSession, buildTeleportContext } from './preflight.js'
import { provision } from './provision.js'
import { transfer } from './transfer.js'
import { launch } from './launch.js'

export function assertSafeShellArg(value: string, name: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Unsafe ${name}: contains invalid characters: ${value}`)
  }
}

export interface PodSsh {
  user: string
  host: string
  port?: string
}

export function parsePodSsh(podSsh: string): PodSsh {
  // Format: user@host or user@host:port
  const atIdx = podSsh.indexOf('@')
  if (atIdx < 0) throw new Error(`Invalid SSH string: ${podSsh}`)

  const user = podSsh.slice(0, atIdx)
  const rest = podSsh.slice(atIdx + 1)

  const colonIdx = rest.lastIndexOf(':')
  if (colonIdx >= 0 && !rest.includes('[')) {
    // user@host:port
    return { user, host: rest.slice(0, colonIdx), port: rest.slice(colonIdx + 1) }
  }
  return { user, host: rest }
}

export function sshCommand(ssh: PodSsh, remoteCmd: string): string[] {
  const target = `${ssh.user}@${ssh.host}`
  if (ssh.port) {
    return ['ssh', '-p', ssh.port, target, remoteCmd]
  }
  return ['ssh', target, remoteCmd]
}

// ── Orchestrator ──

export async function teleport(argv: string[]): Promise<void> {
  // 1. Preflight
  applyMsysGuard()
  const args = parseArgs(argv)
  const projectHash = computeProjectHash(args.projectDir)
  const ccProjectDir = `${CC_PROJECTS_DIR()}/${projectHash}`
  const resolved = await resolveSession(ccProjectDir, args.sessionId)
  const ctx = await buildTeleportContext(args, resolved)

  console.log(`[teleport] Session: ${ctx.sessionId}`)
  console.log(`[teleport] ${ctx.projectDir} → ${ctx.workspaceDir}`)

  // 2. Provision
  const creds = await loadEnvCredentials(args.projectDir)
  await provision(ctx, creds)

  // 3. Transfer
  await transfer(ctx)

  // 4. Launch
  await launch(ctx)
}

// CLI entry point
if (process.argv[1]?.endsWith('teleport.ts') || process.argv[1]?.endsWith('teleport.js')) {
  teleport(process.argv.slice(2)).catch(err => {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  })
}
