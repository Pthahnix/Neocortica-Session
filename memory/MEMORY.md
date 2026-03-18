# Neocortica-Session Memory

## Project Overview
- v2 rewrite: replaced SSH-based session JSONL teleport with Git-based context transfer
- Core insight: CC compacts context repeatedly → CLAUDE.md + MEMORY are the durable context, equivalent to full session JSONL
- Project is now pure skill SOPs + atomic shell scripts, no TypeScript/MCP code

## Architecture
- `skill/session-teleport.md` — 5-phase outbound flow: estimate → create pod → collect context + push → provision → handoff
- `skill/session-return.md` — 3-phase inbound: git pull results → digest → cleanup pod
- `skill/experiment-output.md` — convention doc for checkpoint/result/report (not implemented here)
- 5 atomic scripts in `scripts/`: install-node, create-cc-user, install-cc, setup-env, deploy-context

## Context Flow
- Single-directional: local → pod (via Git)
- MEMORY files copied to repo's `memory/` dir, pushed to GitHub, cloned on pod
- Experiment outputs return as structured files via git push, NOT as MEMORY sync
- Prevents MEMORY conflicts when multiple pods run in parallel

## Key Technical Details
- CC project hash: replace all non-alphanumeric chars with `-` (Windows: `D:\FOO` → `D--FOO`, Linux: `/workspace/repo` → `-workspace-repo`)
- CC memory path: `~/.claude/projects/<hash>/memory/`
- CC settings for bypassPermissions: `/home/cc/.claude/settings.json` (user-level)
- RunPod SSH: public key auth, no password needed
- Pod provision order: Node.js → cc user → CC CLI → env vars → bypassPermissions → deploy context
- CC `.onboarding-complete` marker at `~/.claude/.onboarding-complete` prevents first-run wizard

## User Preferences
- RunPod SSH connects directly with public key — no password
- User prefers atomic single-responsibility scripts over monolithic provision scripts
- Skills guide CC to detect pod state and execute only needed scripts
- No tmux, no auto-start CC — user connects and starts CC themselves
- docs/ is gitignored, stays local only

## Known Issues (Fixed in v2)
- v1 had tmux env var issue: CC crashed because API credentials in .bashrc weren't sourced by tmux shell
- v1 had workspace permission issue: cc user couldn't write to /workspace (fixed with chown)
- v1 had onboarding wizard issue: CC launched first-run wizard in tmux (fixed with .onboarding-complete marker)
- deploy-context.sh: `cp *` doesn't match dotfiles, use `find -type f ! -name '.*'` to exclude .gitkeep

## API Credentials
- Stored in local `.env`: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL
- On pod: written to `/home/cc/.bashrc` via `setup-env.sh`
