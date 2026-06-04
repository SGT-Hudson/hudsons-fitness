#!/usr/bin/env bash
# SessionStart hook: keep the repo synced and warn if the sacred main checkout drifted.
# Fast, idempotent, non-fatal offline. Safe to run from any worktree (it always
# targets the main checkout, not the current working dir). stdout is surfaced to
# the session as additional context.
set -u

MAIN="/mnt/d/dev/hudsons-fitness"

# Best-effort fetch + prune — never block a session on a network failure.
git -C "$MAIN" fetch --prune --quiet origin 2>/dev/null || true
# Clear stale worktree metadata (the Windows D:/ ghosts).
git -C "$MAIN" worktree prune 2>/dev/null || true

# Warn (non-fatal) if the main checkout is off develop or behind origin/develop.
branch=$(git -C "$MAIN" symbolic-ref --quiet --short HEAD 2>/dev/null || echo "")
if [ "$branch" != "develop" ]; then
  echo "⚠ main checkout is on '$branch', not 'develop' (the sacred baseline). Feature work belongs in a worktree."
else
  local_sha=$(git -C "$MAIN" rev-parse develop 2>/dev/null || echo "")
  remote_sha=$(git -C "$MAIN" rev-parse origin/develop 2>/dev/null || echo "")
  if [ -n "$remote_sha" ] && [ "$local_sha" != "$remote_sha" ]; then
    echo "⚠ main checkout's develop is behind origin/develop — fast-forward it: git -C $MAIN merge --ff-only origin/develop"
  fi
fi

exit 0
