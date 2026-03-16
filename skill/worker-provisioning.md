# Worker Provisioning & Task Execution

Fully autonomous SOP — CC handles everything from pod creation to cleanup via Bash SSH + MCP tools. No manual steps.

## Prerequisites

- RunPod MCP server configured and available
- neocortica-relay MCP server configured and available
- User provides: task description, GPU preference (default: RTX 3090)

## Credentials (hardcoded for this project)

```
RELAY_AUTH_TOKEN=neocortica-relay-2026
ANTHROPIC_BASE_URL=https://api.ikuncode.cc
ANTHROPIC_AUTH_TOKEN=sk-ocSQ8pPoUhEBEPoTmbhATNSBbDXyCZ6UBOr3au8V9QucmeJa
ANTHROPIC_MODEL=claude-opus-4-6
RELAY_REPO_URL=https://github.com/Pthahnix/neocortica-relay.git
```

## Phase 1: Create Pod

Use RunPod MCP `create-pod`:

```
create-pod:
  name: "relay-worker-<purpose>"
  gpuTypeIds: ["NVIDIA GeForce RTX 3090"]
  imageName: "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04"
  containerDiskInGb: 20
  volumeInGb: 0
  ports: ["8080/http", "22/tcp"]
  cloudType: "COMMUNITY"
```

After creation, use `get-pod` to poll until status is `RUNNING`. Extract:
- `podId` — for cleanup
- SSH connection info — typically `ssh root@<pod-ip> -p <port>` or via RunPod proxy

## Phase 2: Provision via SSH

CC executes all commands via Bash tool using SSH. Run each block as a separate `ssh` command to handle errors individually.

**Important**: RunPod pods have SSH access as root. The SSH command format is:
```bash
ssh -o StrictHostKeyChecking=no root@<pod-ip> -p <ssh-port> '<command>'
```

### Step 2.1: Create cc user + install Claude CLI

```bash
ssh -o StrictHostKeyChecking=no root@<pod-ip> -p <ssh-port> '
useradd -m -s /bin/bash cc 2>/dev/null || true
usermod -aG sudo cc
chown -R cc:cc /home/cc
su - cc -c "curl -fsSL https://claude.ai/install.sh | bash"
su - cc -c "echo '\''export PATH=\"\$HOME/.local/bin:\$PATH\"'\'' >> ~/.bashrc"
'
```

### Step 2.2: Configure CC settings (bypass permissions)

```bash
ssh -o StrictHostKeyChecking=no root@<pod-ip> -p <ssh-port> '
su - cc -c "mkdir -p /home/cc/.claude && cat > /home/cc/.claude/settings.json << EOF
{
  \"permissions\": {
    \"defaultMode\": \"bypassPermissions\"
  }
}
EOF"
'
```

### Step 2.3: Install Node.js 22

```bash
ssh -o StrictHostKeyChecking=no root@<pod-ip> -p <ssh-port> '
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git
node -v && npm -v
'
```

### Step 2.4: Clone relay + install deps + create workspace dirs

```bash
ssh -o StrictHostKeyChecking=no root@<pod-ip> -p <ssh-port> '
cd /workspace
git clone https://github.com/Pthahnix/neocortica-relay.git 2>/dev/null || (cd neocortica-relay && git pull)
cd neocortica-relay && npm install
mkdir -p /workspace/inbox /workspace/outbox /workspace/experiment /workspace/supervisor
'
```

### Step 2.5: Start worker server in tmux

```bash
ssh -o StrictHostKeyChecking=no root@<pod-ip> -p <ssh-port> '
tmux new-session -d -s relay "cd /workspace/neocortica-relay && RELAY_AUTH_TOKEN=neocortica-relay-2026 RELAY_PORT=8080 RELAY_WORKSPACE=/workspace npx tsx src/worker/server.ts"
'
```

### Step 2.6: Verify worker is running

Wait 5 seconds, then:
```bash
ssh -o StrictHostKeyChecking=no root@<pod-ip> -p <ssh-port> 'tmux capture-pane -t relay -p | tail -5'
```

Should see: `Worker server listening on port 8080`

## Phase 3: Register Worker

Use relay MCP tool:

```
worker_register:
  url: "https://<pod-id>-8080.proxy.runpod.net"
  name: "relay-worker-<purpose>"
```

Expect: `ok: true`, `lastHealth.status: "ok"`

If health check fails, wait 10s and retry (max 3 attempts). Worker server may need startup time.

## Phase 4: Dispatch Task

```
task_dispatch:
  workerId: "<w-xxx>"
  experimentPlan: "<user's task in markdown>"
  checkpoints: ["run"]
  apiKey: "sk-ocSQ8pPoUhEBEPoTmbhATNSBbDXyCZ6UBOr3au8V9QucmeJa"
  baseUrl: "https://api.ikuncode.cc"
  model: "claude-opus-4-6"
```

## Phase 5: Monitor & Collect Results

Poll with `task_status` every 15 seconds until status is terminal (`completed`, `failed`, `aborted`).

```
task_status: { taskId: "<t-xxx>" }
```

If `awaiting_approval`:
```
task_report:   { taskId: "<t-xxx>" }
task_feedback: { taskId: "<t-xxx>", action: "continue" }
```

When `completed`, download results:
```
task_files: { taskId: "<t-xxx>", path: "<file>" }
```

If `failed`, check error in status response. Optionally SSH in to check logs:
```bash
ssh root@<pod-ip> -p <ssh-port> 'tmux capture-pane -t relay -p | tail -30'
```

## Phase 6: Cleanup (ALWAYS runs)

Even if any phase fails, always attempt cleanup:

```
1. worker_unregister: { workerId: "<w-xxx>" }
2. RunPod stop-pod:   { podId: "<pod-id>" }
3. RunPod delete-pod: { podId: "<pod-id>" }
```

## Error Recovery

| Situation | Action |
|-----------|--------|
| Pod creation fails | Try different GPU type or data center |
| SSH connection refused | Pod not ready, wait 30s and retry |
| Claude CLI install fails | Retry, check network connectivity |
| npm install fails | Retry, check disk space |
| Worker server won't start | SSH in, check `tmux capture-pane -t relay -p` |
| Health check fails after 3 retries | SSH in, verify server is listening on 8080 |
| Task fails immediately | Check CC API credentials, SSH in to check CC logs |
| Task stalls (no progress >5min) | `task_abort`, then SSH in to diagnose |
| Cleanup fails | Manually delete pod from RunPod console |

## Safety Rules

1. **ALWAYS clean up pods** — RunPod charges by the minute
2. **Never leave a pod running** after task completion or failure
3. **Budget guard**: if user hasn't specified, confirm before creating expensive GPUs (A100, H100)
4. **Timeout**: if task runs >30 minutes with no progress, abort and clean up
