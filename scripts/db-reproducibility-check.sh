#!/usr/bin/env bash
# R-00 reproducibility check (Wave-3 validation item).
#
# Confirms `supabase/migrations/*` (baseline 20260508080000 → sprint9
# 20260514120000 → the 20260518* Wave-3 files) reproduces the live prod
# schema with NO drift. Expected result: an empty `supabase db diff --linked`.
#
# Requires: Docker + Supabase CLI, and the project linked once via
#   supabase link --project-ref upvraruehzurbetzrxov
#
# This is NOT run by the required `lint-build` CI job. It runs only in the
# manual `db-tests` workflow or locally on a Docker-capable machine.
set -euo pipefail

echo "==> supabase db reset (apply full migration history to a clean local DB)"
supabase db reset

echo "==> supabase db diff --linked (local migration state vs linked prod)"
DIFF="$(supabase db diff --linked 2>&1 || true)"

if [ -z "${DIFF//[$' \t\r\n']/}" ] || echo "$DIFF" | grep -qiE 'no schema changes found|no changes|up to date'; then
  echo "PASS: migration history reproduces prod (empty diff)."
  exit 0
fi

echo "FAIL: migration history diverges from prod. Diff:"
echo "$DIFF"
exit 1
