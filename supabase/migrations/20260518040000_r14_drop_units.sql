-- R-14 / D-E3: drop the dead profiles.units column.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- D-E3 removes `profiles.units` entirely. It is fully dead legacy:
-- `text not null default 'metric' check (units in ('metric','imperial'))`,
-- never written by any form (always the default), never read, with no
-- imperial code path anywhere (every display hardcodes kg/g/cm). This is a
-- cleaner-cut removal than R-03's `bone_kg`: not even a mandatory field, zero
-- UI, zero computations — pure abandoned-design residue. Metric-only (kg/cm/g)
-- is the confirmed invariant; the DB stores metric canonically. The shelved
-- imperial/metric display-toggle is deliberately NOT built and the column is
-- NOT kept as a speculative hook (YAGNI, mirroring D-A6/D-B5).
--
-- The app + hand-written types (src/types/database.ts) drop `units` in this
-- same PR; reading fewer columns than exist in prod is safe and causes no
-- runtime break, so the code/types purge merges autonomously. This file
-- stages the actual schema change but is intentionally NOT applied by this
-- PR: the live Supabase project (upvraruehzurbetzrxov) is untouched here. It
-- is timestamped after the R-00 baseline (20260508080000), after sprint9
-- (20260514120000), and after R-03's drop (20260518030000), so the order is
-- baseline → sprint9 → staged Wave-3.
--
-- Applied by the operator at the Wave-3 prod-migration checkpoint, alongside
-- the other staged structural migrations. Idempotent (`if exists`) so a
-- re-apply is a verified no-op. Do not run this against any database from CI
-- or from this PR.

alter table public.profiles
  drop column if exists units;
