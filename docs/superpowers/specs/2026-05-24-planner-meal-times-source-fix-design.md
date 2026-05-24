# Planner meal-periods source fix (regression) — Design

**Status:** design — awaiting user review before plan
**Origin:** regression fix for the planner periods/layout change (#107/#108, shipped to `main`).
**Depends on:** that change (already in `develop`/`main`).
**Scope:** `fetchActiveWeek` data source only. `WeekGrid`/`PlanificadorPage` are unchanged (they were correct). No data-model change, no migration, no edge change.

## 1. The bug (root cause — confirmed)

`fetchActiveWeek` selects `meal_times` from **`meal_plan_weeks`**, but that table has **no `meal_times` column** (it lives on `meal_plan_template_day_times`). PostgREST returns an error → the active-week query throws → the planner renders empty and applying a template appears to do nothing (the post-apply refetch also throws).

Why it shipped green: the `.select(...)` is a raw string with an `as unknown as {…}` cast, so **TypeScript can't validate the column**, and component tests **mock Supabase**, so nothing exercised the real query. Only a real DB / the running app surfaces it.

## 2. Correct source of a week's meal periods

A week's periods come from its **source template**, exactly as `apply_template_to_week` builds them:

> per day: `meal_plan_template_day_times.meal_times[dow]`, falling back to
> `meal_plan_templates.default_meal_times`.

The week itself stores no schedule. The existing `fetchActiveWeek` already embeds
`source_template:meal_plan_templates (id, name)` — we extend that embed with
`default_meal_times` (a real column) and use it as the period list.

## 3. The fix (`fetchActiveWeek` only)

`src/features/planner/api.ts`:

1. **Embed the column** — change the select's template embed from
   `source_template:meal_plan_templates (id, name)` to
   `source_template:meal_plan_templates (id, name, default_meal_times)`.
   **Remove** the invalid top-level `meal_times` from the select.
2. **Map it** — set `ActiveWeek.meal_times` from the embedded template:
   `meal_times: tpl?.default_meal_times ?? []`. (`tpl` is the already-unwrapped
   `source_template`.) Drop the `raw.meal_times` read.
3. The `ActiveWeek.meal_times: string[]` field and the raw cast keep their shape;
   only the origin changes (template embed instead of a week column).

`time[]` values arrive as `"HH:MM:SS"` strings — identical to how slot `meal_time`
arrives — so the period labels (`.slice(0,5)`) and the `meal_index`→period mapping
line up with the slots, matching `apply_template_to_week`.

**`WeekGrid` and `PlanificadorPage` are unchanged** — they already consume
`mealTimes` to render all periods (empty included) with the summary at the bottom.

## 4. Edge cases

- **No source template / template deleted** (`source_template_id` null or embed
  returns null): `meal_times = []`. `WeekGrid` degrades gracefully — every slot
  becomes an "orphan" period, i.e. the pre-feature behaviour (only periods that have
  a recipe are shown); no empty periods, no crash.
- **Diverged week** (`has_diverged`): periods still come from the template; any slot
  whose `meal_index` is outside `default_meal_times` shows as a trailing orphan period
  (existing `WeekGrid` logic). No data hidden.

## 5. Out of scope

- **Per-day schedules** (`meal_plan_template_day_times`): the template editor only
  creates `same_schedule_all_days` templates today, so `default_meal_times` is the
  authoritative per-day schedule for every reachable template. Using day-times per
  `day_of_week` is a future enhancement (apply already supports it).
- No change to `WeekGrid`, `PlanificadorPage`, the apply/save RPCs, or any migration.

## 6. Testing

- **Tier-2 mapping guard:** a unit test for `fetchActiveWeek`'s mapping is awkward (it
  calls Supabase). Add a focused test only if the mapping is extracted to a pure
  helper; otherwise rely on the existing `WeekGrid` tests (which already cover
  rendering all periods from a `mealTimes` array) plus the verification below.
- **Real-query verification (REQUIRED — this is the gap that caused the bug):** before
  shipping, run the app (or a direct query) against a real Supabase so the
  `fetchActiveWeek` select is exercised end-to-end: open the planner, apply a
  template, confirm the week loads, all periods show (empty included), and adding a
  recipe to an empty period persists. Unit tests + typecheck CANNOT catch a bad
  PostgREST select string.

## 7. Risks / notes

- **Process lesson:** changes to PostgREST `.select(...)` strings are invisible to
  typecheck and to Supabase-mocked tests. They MUST be verified against a real
  database/app before merge. (Worth a memory + a CLAUDE.md note.)
- **Ship path:** prod (`main`) is currently broken by this regression. Fix flows
  `claude/fix-*` → develop → release → main (no rush per the user); or promote as a
  hotfix if priorities change.
