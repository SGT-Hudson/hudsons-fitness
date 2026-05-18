-- R-12 / D-D6: single `materialize_plan_for_date` RPC + partial unique index.
--
-- STAGED — DO NOT AUTO-APPLY — Wave-3.
--
-- ⚠ SPECIAL ORDERING (read the PR body): unlike the other staged Wave-3
-- migrations, R-12's CODE depends on this migration. The client
-- (`src/features/diario/api.ts`) and the edge function
-- (`supabase/functions/daily-nutrition-snapshot/index.ts`) are rewritten in
-- the same PR to call `supabase.rpc('materialize_plan_for_date', …)`. That
-- RPC does NOT exist in prod until this file is applied. Therefore BOTH the
-- migration AND the code are gated to the Wave-3 checkpoint and the PR is
-- HELD: at the checkpoint the operator (a) applies this migration to prod,
-- THEN (b) merges the PR (the code), THEN (c) redeploys
-- `daily-nutrition-snapshot`. If the code merged before this migration were
-- applied, prod plan-materialization would break (the RPC would 404). The
-- live Supabase project (upvraruehzurbetzrxov) is untouched by this PR.
--
-- ── What this does (D-D6) ──────────────────────────────────────────────────
-- D-D6 confirms the model (plan = default truth; active-week slots →
-- `from_plan` meal_logs; dedup by `plan_week_slot_id`; `from_plan` is an
-- editable origin marker; manual adds stay `from_plan=false`; plan edits
-- after materialization do not propagate back) and fixes three real defects
-- the conventions review found:
--   1. The materialization logic was hand-mirrored across two runtimes
--      (client TS + a re-typed Deno copy that literally commented
--      "Server-side mirror of…") — a drift hazard, exactly the
--      single-source-of-truth case the D-C5 RPC invariant targets.
--   2. No DB-level idempotency: `meal_logs` had no unique constraint on
--      `(user_id, plan_week_slot_id)`; dedup was app-level read-then-write,
--      so a concurrent client effect + cron (or two tabs / fast double
--      mount) could both read "missing" and double-insert.
--   3. The client materialized FUTURE dates: `materializePlanForDate` had no
--      `date <= today` bound and DiarioPage fires for whatever date is in
--      the URL, so `/diario/<future-date>` inserted future plan slots as
--      already-consumed logs, contradicting "the diary is the truth of what
--      I ate" (the cron was safe; the client was the leak).
-- One INVOKER RPC + a partial unique index + an in-RPC `date <= today` guard
-- fixes all three at once and enacts the D-C5 SECURITY INVOKER invariant.
--
-- ── Order-independence vs the other staged Wave-3 migrations ───────────────
-- This migration is INDEPENDENT and ORDER-FREE with respect to the other
-- staged migrations (R-06 `20260518000000`, R-18 `20260518010000`,
-- R-07 `20260518020000`, R-03 `20260518030000`, R-14 `20260518040000`,
-- R-08 `20260518050000`). It only ADDS a function plus a partial unique
-- index on `public.meal_logs`; it touches no column those migrations add or
-- drop (they touch `phases`, `cron`, `tdee_state`/`tdee_estimates`,
-- `profiles`). The object sets are disjoint and there is no collision, so it
-- may be applied in any position relative to them at the Wave-3 checkpoint
-- with the same end state. It is timestamped after R-08
-- (`20260518050000`) only to keep the file ordering monotonic
-- (baseline `20260508080000` → sprint9 `20260514120000` → staged Wave-3).
--
-- Idempotent (`create or replace` / `if not exists`) so a re-apply is a
-- verified no-op. Do not run this against any database from CI or from this
-- PR.

-- ── Partial unique index — DB-level idempotency / race safety ──────────────
-- Makes `(user_id, plan_week_slot_id)` unique only for plan-materialized
-- rows (`plan_week_slot_id is not null`). Manual logs (`plan_week_slot_id`
-- null, `from_plan=false`) are unconstrained and may repeat freely. The
-- RPC's INSERT uses `on conflict do nothing` against this index for true
-- DB-level idempotency (defect 2): concurrent client + cron, two tabs, or a
-- fast double-mount can no longer double-insert the same slot.
create unique index if not exists meal_logs_user_plan_slot_uidx
  on public.meal_logs (user_id, plan_week_slot_id)
  where plan_week_slot_id is not null;

-- ── materialize_plan_for_date RPC ──────────────────────────────────────────
-- SECURITY INVOKER + `set search_path = public` per the D-C5 / D-D6
-- invariant (NOT SECURITY DEFINER; the only sanctioned DEFINER RPC remains
-- the cron-only `apply_template_to_week_admin`). Because it runs as the
-- invoker, the existing per-user RLS on `meal_plan_weeks` /
-- `meal_plan_week_slots` / `meal_logs` already scopes every statement to the
-- caller's own rows — the explicit `user_id = p_user_id` predicates below
-- are belt-and-braces (and let the service-role cron pass an explicit user).
--
-- Body = the prior hand-written materialization logic, verbatim in SQL:
--   pick the active week whose `week_start <= p_date` (latest one),
--   take that week's slots for `p_date`,
--   insert the missing ones as `from_plan = true` meal_logs carrying
--   `plan_week_slot_id`, `on conflict do nothing` (the partial unique index).
-- Returns the number of rows actually inserted — the same return contract
-- the callers (`materializePlanForDate` → `useMaterializePlan`, and the
-- edge cron's per-profile `materialized` count) already expect.
--
-- ── The `date <= today` guard (defect 3) + TZ approach ─────────────────────
-- The architecture spec's Diario-materialization rule is "today or any past
-- date". Future dates must NO-OP (return 0), never insert. "Today" MUST be
-- the same Madrid-canonical day the rest of the app uses — the TS core
-- `todayInTZ('Europe/Madrid')` / `previousDayInTZ('Europe/Madrid')`
-- (D-F4: single-TZ, Europe/Madrid until a real non-Madrid user exists).
-- Mirrored in SQL as the calendar date of `now()` rendered in the
-- `Europe/Madrid` zone: `(now() at time zone 'Europe/Madrid')::date`.
-- `now() at time zone 'Europe/Madrid'` yields the wall-clock timestamp in
-- Madrid; `::date` truncates to that zone's calendar day — exactly what
-- `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })` produces in
-- `isoDateInTZ`. Using `current_date` instead would be the DB session TZ
-- (UTC on Supabase), a day behind for a caller near Madrid midnight — the
-- same host-TZ footgun D-F4 documents. When D-F4's multi-TZ path lands this
-- single literal becomes the per-user `profile.timezone`; recorded here so
-- the escape hatch is pre-analysed.
create or replace function public.materialize_plan_for_date(
  p_user_id uuid,
  p_date date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_week_id uuid;
  v_inserted integer;
begin
  -- Defect 3: never materialize a future date. The diary is the truth of
  -- what was eaten; future plan slots are not yet "eaten".
  if p_date > v_today then
    return 0;
  end if;

  -- Pick the active week: the latest week whose start is on/before p_date.
  select w.id
    into v_week_id
    from public.meal_plan_weeks w
    where w.user_id = p_user_id
      and w.week_start <= p_date
    order by w.week_start desc
    limit 1;

  if v_week_id is null then
    return 0;
  end if;

  -- Insert the missing slots for p_date as from_plan meal_logs. The partial
  -- unique index + `on conflict do nothing` make this DB-idempotent (defect
  -- 2): re-runs, concurrent cron/client, double-mounts insert each slot once.
  with inserted as (
    insert into public.meal_logs
      (user_id, logged_on, meal_type, recipe_id, servings,
       from_plan, plan_week_slot_id)
    select
      p_user_id,
      p_date,
      (array['breakfast','lunch','snack','dinner','other'])[
        least(s.meal_index, 4) + 1
      ],
      s.recipe_id,
      s.servings,
      true,
      s.id
    from public.meal_plan_week_slots s
    where s.plan_week_id = v_week_id
      and s.date = p_date
    on conflict (user_id, plan_week_slot_id)
      where plan_week_slot_id is not null
      do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from inserted;

  return coalesce(v_inserted, 0);
end;
$$;

comment on function public.materialize_plan_for_date(uuid, date) is
  'R-12/D-D6: single source of truth for plan materialization. SECURITY '
  'INVOKER. Inserts missing from_plan meal_logs for the active week''s slots '
  'on p_date; idempotent via the meal_logs_user_plan_slot_uidx partial '
  'unique index + ON CONFLICT DO NOTHING; no-ops future dates '
  '(p_date > today, Europe/Madrid). Returns the inserted row count.';

-- Callable by authenticated users (RLS still scopes rows to the caller) and
-- by the service_role cron (which passes an explicit p_user_id per profile).
grant execute on function public.materialize_plan_for_date(uuid, date)
  to authenticated, service_role;
