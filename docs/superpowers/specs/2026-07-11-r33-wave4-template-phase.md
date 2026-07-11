# R-33 wave 4 — template phase tag (schema amendment)

**Status:** approved (Gonzalo, 2026-07-11). Amends the R-33 spec, which declared
"no schema/RLS/RPC changes anywhere in R-33" (§7).

## Why this exists

The Plantillas wave's design is built on a template *knowing its phase*: the
library tints each card by phase, filters by phase chips, and the "Guardar como
plantilla" modal asks for the phase and colours the live preview by it. Today
`meal_plan_templates` has **no phase column** — a template is phase-agnostic, and
the `phaseType` the editor already shows comes from `useDailyTarget()`, i.e. the
user's phase *today*, not the template's.

Without the column, three of the wave's four surfaces lose their organising
idea. Deriving it is not possible: today's active phase would tint every
template identically, and the phase active at creation time is stored nowhere.

So R-33 takes one sanctioned exception, scoped to this: **one nullable column and
the two RPCs that write templates.** No RLS change; both RPCs stay
`SECURITY INVOKER`.

## Schema

```sql
alter table public.meal_plan_templates
  add column phase_type text
    check (phase_type is null or phase_type in ('cut','maintenance','bulk'));
```

**Nullable on purpose.** Every existing template predates the column and has no
honest phase to assign; a template without a phase is a legitimate, permanent
state ("sirve para cualquier fase"). The UI must render an untagged template
neutrally — never guess a phase for it. The values mirror `phases.phase_type`'s
check constraint exactly, but there is deliberately **no FK to `phases`**: this
is a loose label ("this menu is for a cut"), not a reference to one particular
dated phase the user once ran.

## RPCs

Both change signature, so both are dropped and recreated (a defaulted trailing
parameter would create an overload, leaving the old body live):

- `save_template(...)` gains `p_phase_type text default null` and writes it on
  insert and update.
- `save_week_as_template(p_week_id, p_name)` gains `p_phase_type text default
  null`, so "guardar como plantilla" from the planner can tag what it saves.
  It keeps hard-coding `is_auto_generated = false`.

Both remain `SECURITY INVOKER`; RLS on `meal_plan_templates` (`auth.uid() =
user_id`) is unchanged and stays the sole boundary. A bad phase string is
rejected by the check constraint, not by app code.

## Test gate

Tier-3 (pgTAP, `supabase/tests/`) must cover: the column's check constraint
rejects a bogus value and accepts the three valid ones plus `null`;
`save_template` round-trips a phase on create and on update, and can clear it
back to `null`; `save_week_as_template` tags what it creates; and RLS still
prevents reading or writing another user's template. The Tier-3 `db-test` job is
required on `develop`, so this runs in CI.

## Deployment note

The live project needs this migration applied before the wave reaches `main`
(see the `live-db-migration-gap` runbook note: `supabase db push` is unusable
here; migrations go out through the pg runner). CI's `db-test` job runs
migrations from scratch locally and gates the merge to `develop` regardless.

## Out of scope

- Backfilling a phase onto existing templates (there is nothing truthful to
  backfill from).
- Any link between a template's phase and the *active* phase — applying a
  cut template while bulking is allowed and is not warned about. If that
  warning is wanted later, it is a new roadmap item.
- The `is_auto_generated` "Auto" badge: dropped from the UI this wave (the flag
  is never set to `true` anywhere — the mechanism it advertises does not exist).
  The column stays in the DB.
