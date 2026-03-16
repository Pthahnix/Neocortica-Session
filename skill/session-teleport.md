# Session Teleport — Full Lifecycle SOP

Orchestrates exporting a CC session to a remote GPU pod, running experiments with full research context, and returning results.

## Prerequisites
- RunPod MCP server configured and working
- neocortica-session MCP server configured
- neocortica-session CLI available (`npx tsx src/cli/teleport.ts`)

## Phase 1: Hardware Estimation

1. Read the experiment plan from the current research context
2. Use `prompt/hardware-estimation.md` to analyze requirements
3. Estimate: GPU type/count, disk space, estimated cost/hour
4. Present estimate to user and **wait for confirmation**
   - If user declines → STOP (no cleanup needed)

## Phase 2: Pod Creation (RunPod MCP)

1. Call `create-pod` with estimated hardware:
   - `gpuTypeIds`: from Phase 1 estimate
   - `gpuCount`: from Phase 1 estimate
   - `imageName`: `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04`
   - `containerDiskInGb`: from Phase 1 estimate
   - `volumeInGb`: 0 (no persistent volume needed)
   - `ports`: `['22/tcp']`
   - `name`: `neocortica-experiment`
2. Wait for pod status = RUNNING
3. Extract SSH connection info (host, port)
4. **Record `podId` for Phase 7 cleanup**
   - If pod creation fails → STOP (no cleanup needed)

## Phase 3: Pod Provision (Bash SSH)

1. Install Claude Code CLI:
   ```bash
   ssh <pod-ssh> "curl -fsSL https://claude.ai/install.sh | bash"
   ```
2. Install Node.js 22 (if experiment needs it):
   ```bash
   ssh <pod-ssh> "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"
   ```
3. Configure CC settings (allowedTools, permissions)
4. Create workspace: `ssh <pod-ssh> "mkdir -p /workspace/experiment"`
5. **Transfer project configuration**:
   ```bash
   scp CLAUDE.md <pod-ssh>:/workspace/
   scp .claude/settings.json <pod-ssh>:/workspace/.claude/
   scp .mcp.json <pod-ssh>:/workspace/  # if applicable
   ```
   CC reads these from CWD — without them the resumed session lacks project instructions.
6. Set `ANTHROPIC_API_KEY` on the pod (required for CC):
   ```bash
   ssh <pod-ssh> "echo 'export ANTHROPIC_API_KEY=...' >> ~/.bashrc"
   ```
   - If provision fails → go to Phase 7 (cleanup)

## Phase 4: Session Teleport

1. Call MCP `session_export` → generate archive
2. Call CLI teleport:
   ```bash
   npx tsx src/cli/teleport.ts <pod-ssh> <archive-path>
   ```
   This performs: local remap → scp → unpack → tmux CC
   - If teleport fails → go to Phase 7 (cleanup)

## Phase 5: Handoff

Output to user:
```
Session teleported to pod <podId>. Connect:
  ssh <pod-ssh>
  tmux attach -t neocortica

When done, return to local CC and run:
  /session-return <pod-ssh>
```

## Phase 6: Return (triggered by user after experiment)

1. Call CLI return:
   ```bash
   npx tsx src/cli/return.ts <pod-ssh>
   ```
   This performs: remote pack → scp → local remap → register
2. Output resume command: `claude --resume <session-id>`
   - If return fails → warn user, provide manual scp fallback

## Phase 7: Cleanup (ALWAYS runs if Phase 2 succeeded)

1. `stop-pod(podId)`
2. `delete-pod(podId)`
3. Confirm cleanup to user
   - If cleanup fails → alert user with manual cleanup instructions:
     ```
     Manual cleanup needed:
       1. Go to https://www.runpod.io/console/pods
       2. Find pod <podId>
       3. Stop and delete it
     ```

**Golden rule**: Phase 7 ALWAYS runs if Phase 2 succeeded. No exceptions.

## Error Recovery Matrix

| Phase | Failure | Action |
|-------|---------|--------|
| 1 | User declines | Stop |
| 2 | Pod creation fails | Stop, no cleanup needed |
| 3 | Provision fails | Cleanup pod (Phase 7) |
| 4 | Teleport fails | Cleanup pod (Phase 7) |
| 5 | User can't connect | Troubleshoot, cleanup if unresolvable |
| 6 | Return fails | Warn, manual scp fallback |
| 7 | Cleanup fails | Alert user with manual instructions |
