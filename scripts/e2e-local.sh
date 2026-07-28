#!/usr/bin/env bash
# Run the e2e smoke against the already-running local Supabase stack:
# seeds the fixture, exports the stack's env, runs Playwright (which builds).
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(supabase status -o env)"
export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
if command -v psql >/dev/null 2>&1; then
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed/e2e-fixture.sql
else
  # Fallback for machines without a host psql client: pipe the fixture through
  # the stack's own Postgres container instead.
  docker exec -i supabase_db_hudsons-fitness psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed/e2e-fixture.sql
fi
pnpm exec playwright test "$@"
