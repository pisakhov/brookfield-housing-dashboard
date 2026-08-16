#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_REPO=/root/projects/brookfield-housing-dashboard
STATE_DIR=/root/.local/state/x-agent-brookfield-market
MODE=${1:-weekly}
PENDING_FILE="$STATE_DIR/release-pending"

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }

if [[ $MODE != weekly && $MODE != retry ]]; then
  echo "usage: $0 [weekly|retry]" >&2
  exit 2
fi
mkdir -p "$STATE_DIR" /root/.cache/x-agent
if [[ $MODE == retry && ! -s $PENDING_FILE ]]; then
  exit 0
fi

run_root=$(mktemp -d /root/.cache/x-agent/housing-refresh.XXXXXX)
worktree="$run_root/worktree"
cleanup() {
  local rc=$?
  git -C "$SOURCE_REPO" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf "$run_root"
  log "END mode=$MODE status=$rc"
  exit "$rc"
}
trap cleanup EXIT

log "START mode=$MODE"
root_usage=$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if (( root_usage >= 95 )); then
  log "ERROR Headquarters root usage is ${root_usage}%"
  "$SOURCE_REPO/ops/x-agent-console-notify.sh" "Housing Market Refresh" "The housing dashboard refresh was blocked because Headquarters disk usage is ${root_usage}%. No source or production data changed. [Open Brookfield](https://brookfield-market.187.77.218.3.sslip.io)" || true
  exit 1
fi

git -C "$SOURCE_REPO" fetch --quiet origin main
git -C "$SOURCE_REPO" worktree add --quiet --detach "$worktree" origin/main
SOURCE_REPO="$SOURCE_REPO" STATE_DIR="$STATE_DIR" "$worktree/ops/weekly-refresh-worker.sh" "$MODE"

if [[ -z $(git -C "$SOURCE_REPO" status --porcelain --untracked-files=all) ]]; then
  git -C "$SOURCE_REPO" fetch --quiet origin main
  git -C "$SOURCE_REPO" merge --ff-only --quiet origin/main
fi
