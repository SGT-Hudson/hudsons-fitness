# Planner meal-periods source fix (regression) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the planner regression by sourcing each week's meal periods from its source template's `default_meal_times` (a real column) instead of the non-existent `meal_plan_weeks.meal_times`.

**Architecture:** Single change to `fetchActiveWeek`: drop the invalid top-level `meal_times` select, add `default_meal_times` to the already-present `source_template` embed, and map `ActiveWeek.meal_times` from it. `WeekGrid`/`PlanificadorPage` are unchanged (they already consume `mealTimes`). No migration, no other files.

**Tech Stack:** React + TS, Supabase JS (PostgREST), Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-24-planner-meal-times-source-fix-design.md`

> **Why no unit test for the actual bug:** the bug is in a PostgREST `.select()` string, which TypeScript can't validate (results are cast `as unknown`) and which Vitest never executes (Supabase is mocked). The acceptance gate for this fix is therefore the **real-app verification in Task 2, Step 2** — not a unit test. A proper integration/e2e guard is tracked separately (see the `need-integration-and-e2e-guard` project memory).

---

## Task 1: Source `meal_times` from the template embed in `fetchActiveWeek`

**Files:**
- Modify: `src/features/planner/api.ts`

- [ ] **Step 1: Remove the invalid `meal_times` from the select + add it to the template embed**

In `src/features/planner/api.ts`, the `fetchActiveWeek` select currently starts:

```
      `id, week_start, meal_times, source_template_id, has_diverged,
       source_template:meal_plan_templates (id, name),
```

Change those two lines to:

```
      `id, week_start, source_template_id, has_diverged,
       source_template:meal_plan_templates (id, name, default_meal_times),
```

(Remove the top-level `meal_times,` — `meal_plan_weeks` has no such column — and add
`default_meal_times` to the `source_template` embed, which is a real column on
`meal_plan_templates`.)

- [ ] **Step 2: Update the raw cast**

Find the `const raw = data as unknown as { … }` block. **Remove** the line
`meal_times: string[];`, and change the `source_template` line to include
`default_meal_times`:

```ts
  const raw = data as unknown as {
    id: string;
    week_start: string;
    source_template_id: string | null;
    has_diverged: boolean;
    source_template:
      | { id: string; name: string; default_meal_times: string[] }
      | { id: string; name: string; default_meal_times: string[] }[]
      | null;
    meal_plan_week_slots: RawSlot[];
  };
```

- [ ] **Step 3: Map `meal_times` from the (unwrapped) template**

`tpl` is already computed right after the cast
(`const tpl = Array.isArray(raw.source_template) ? raw.source_template[0] : raw.source_template;`).
In the returned object, change:

```ts
    meal_times: raw.meal_times ?? [],
```
to:
```ts
    meal_times: tpl?.default_meal_times ?? [],
```

(`time[]` arrives as `"HH:MM:SS"` strings, matching slot `meal_time` — the period
labels and `meal_index`→period mapping line up, exactly as `apply_template_to_week`
builds them. When there is no source template, `tpl` is null → `meal_times = []` and
`WeekGrid` degrades gracefully to slots-derived periods.)

- [ ] **Step 4: Typecheck + existing tests**

Run: `cd /d/dev/hudsons-fitness/.claude/worktrees/fix-planner-meal-times && pnpm typecheck && pnpm test -- WeekGrid`
Expected: typecheck clean; WeekGrid tests pass (they already cover rendering all
periods from a `mealTimes` array — unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/features/planner/api.ts
git commit -m "fix(planner): source week meal periods from template default_meal_times (not a non-existent week column)"
```

---

## Task 2: Verify + ship

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`
Expected: lint 0 errors, typecheck clean, build ok, full suite green.

- [ ] **Step 2: Real-app verification (ACCEPTANCE GATE — required)**

This is the gate that unit tests/typecheck cannot provide. Against a real Supabase
(local stack via the CLI, or the deployed develop preview):
- Open the planner. It loads (no error; not stuck empty).
- Apply a template. The week populates; **all** meal periods of each day show, empty
  ones included with "+ Añadir"; macros render at the bottom of each day.
- Add a recipe to a previously-empty period → it persists (slot created with the right
  `meal_index`/`meal_time`).
- Confirm the browser console shows **no** PostgREST/`meal_times` error on the
  active-week request.

If this step can't be run here, hand it to the user to confirm before merge — do NOT
merge on green unit tests alone (that is exactly what let the regression through).

- [ ] **Step 3: Push + PR to develop**

```bash
git push -u origin claude/fix-planner-meal-times-source
gh pr create --base develop --title "fix(planner): source meal periods from template (regression fix)" --body "<summary + 'Fixes the planner regression; implements docs/superpowers/specs/2026-05-24-planner-meal-times-source-fix-design.md'>"
```

(Then promote to `main` via a `release/*` PR — prod currently carries the regression.)

---

## Self-Review (completed)

- **Spec coverage:** source from template `default_meal_times` (Task 1 Steps 1–3),
  remove invalid week column (Step 1–2), graceful `[]` fallback when no template
  (Step 3 note), WeekGrid/PlanificadorPage untouched, real-app verification gate
  (Task 2 Step 2). ✓
- **Placeholder scan:** none — every step has the exact code/commands.
- **Type consistency:** `ActiveWeek.meal_times: string[]` is unchanged; only its source
  moves from `raw.meal_times` to `tpl?.default_meal_times`. The raw `source_template`
  type gains `default_meal_times: string[]` consistently in both array/object arms.
