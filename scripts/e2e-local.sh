#!/usr/bin/env bash
# Run the e2e smoke against the already-running local Supabase stack:
# seeds the fixture, exports the stack's env, runs Playwright (which builds).
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(supabase status -o env)"
export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed/e2e-fixture.sql
pnpm exec playwright test "$@"
