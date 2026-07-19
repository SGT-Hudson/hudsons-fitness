# RLS `WITH CHECK` uniformity — close a phantom gap and stop the tests lying

**Date:** 2026-07-19
**Thread:** RLS/test hygiene (spawned by the R-36 reviews)
**Type:** schema hygiene (no behaviour change)

## Problem

`supabase/tests/02_rls_child.test.sql` carries two `todo_start` blocks (lines
64-72 and 83-89) claiming that `workout_sets` and `recipe_ingredients` allow a
child row to be re-pointed into another user's parent, because their UPDATE
policies have `USING` but no `WITH CHECK`.

**The gap does not exist.** When a Postgres UPDATE policy has no `WITH CHECK`,
the `USING` expression is applied to the *new* row as well. Both policies are
therefore already closed. This was proven during R-36: a reviewer deleted the
`WITH CHECK` from the new `recipe_steps` UPDATE policy — whose `USING` and
`WITH CHECK` are character-for-character identical — and the full pgTAP suite
stayed green.

So the two `todo` assertions have been *passing* for months. A TODO test that
silently succeeds is the worst kind of coverage: it reads as tracked debt while
asserting nothing.

**The label is also wrong.** These blocks call it "the R-22 gap", but R-22 in
`docs/roadmap.md:791` is *Training Routines & Cyclic Planner*, closed
2026-05-24, which says nothing about RLS. No roadmap entry describes this gap.
`docs/roadmap.md:596-600` still announces it as outstanding.

Beyond those two, nine further tables carry UPDATE policies with no `WITH CHECK`
— `profiles`, `body_measurements`, `goals`, `phases`, the `meal_plan_*` family,
`meal_logs`, `daily_nutrition_history`, `tdee_estimates` — all from the R-00
baseline and never redefined. Same mechanism, same non-problem.

## Decisions

1. **Uniform the whole schema** (approved), not just the two tables the tests
   name. Every UPDATE policy in `public` gets an explicit `WITH CHECK`.
2. **`ALTER POLICY`, not drop-and-recreate.** Postgres supports adding the
   clause in place, so no policy body is retyped and no nuance can be lost in
   transcription.
3. **No new roadmap ID.** The gap is closed in the same change that names it;
   inventing an ID to immediately retire it is ceremony.

## Design

### Migration

One migration, a flat list of `alter policy … using (…) with check (…)`, one per
affected table. Each repeats the policy's existing `USING` expression as the
`WITH CHECK` — which is exactly what Postgres was already doing implicitly, so
behaviour is unchanged by construction.

The header records why: the clause is explicit intent, and insurance against a
future edit that narrows `USING` and would otherwise silently stop covering the
new row.

### A meta-test instead of point assertions

The two `todo` blocks are deleted, not converted. Point assertions per table
would have to be added by hand for every table created from now on — the same
maintenance failure that produced this state. In their place, one assertion over
the catalogue:

```sql
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and cmd = 'UPDATE' and with_check is null),
  0, 'every UPDATE policy in public carries a WITH CHECK');
```

This covers the tables that exist today *and* any table added later. It fails
loudly the day someone writes a `USING`-only UPDATE policy.

The `routine_exercises` comment at `02_rls_child.test.sql:91`, which frames F-2
as having "closed the gap", is corrected in the same pass — it perpetuates the
same misunderstanding.

### Docs

- `docs/roadmap.md:596-600` — drop the claim that a WITH-CHECK gap remains.
- `docs/data-model.md` — state the Postgres semantics plainly (absent
  `WITH CHECK` ⇒ `USING` applies to the new row), so the next reader does not
  re-derive it or re-file the bug.
- `docs/decisions.md` — a decision entry recording that the gap was never
  exploitable and why the clause is written anyway.

## Testing

`supabase test db` must stay green throughout, and the meta-test must be proven
to bite: strip the `WITH CHECK` from one policy, run the suite, watch it go red,
restore. A migration that only adds redundancy is otherwise indistinguishable
from a migration that does nothing.

## Explicitly not in scope

INSERT, DELETE and SELECT policies. Only UPDATE has the implicit-fallback
behaviour this change is about.
