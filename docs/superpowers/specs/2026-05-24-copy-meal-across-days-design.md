# U-6 — Copy a meal across days — Design

**Status:** design — awaiting user review before plan
**Triage item:** U-6 (see `2026-05-23-notes-triage.md`)
**Depends on:** nothing new. Builds on the existing planner/template slot model and the
uniform-meal-periods model fixed on 2026-05-23 (`f516b6e`, `a7e052a`).

## 1. Goal

Let the user duplicate **one planned meal** (e.g. Monday's breakfast) onto **other
days**, in both the **template editor** and the **week planner**. A copy icon on a
meal opens a modal where the user picks the target days; confirming replaces each
target day's slots at the **same meal index** with copies of the source meal's slots.
Only that meal is copied — never the whole day.

## 2. Decisions (brainstorming 2026-05-23 / 2026-05-24, confirmed via mockup)

1. **Both surfaces** — template editor and planner. Same modal component; different
   target sets and different persistence (see §5).
2. **Copy granularity = one meal**, not a day. A "meal" is all slot rows sharing a
   `meal_index` for one day (template: `(day_of_week, meal_index)`; planner:
   `(date, meal_index)`).
3. **Overwrite, not merge.** A target day's existing slots at that meal index are
   **replaced** by copies of the source. Each target day that already has ≥1 slot at
   that index shows a **"se sobrescribirá"** badge in the modal.
4. **Selection.** Nothing pre-selected on open. A **"Seleccionar todos"** checkbox
   (with an indeterminate state for partial selection) toggles all candidate days.
   Individual day checkboxes otherwise. Confirm is disabled with 0 days selected.
5. **Uniform meal periods** mean every day exposes the same meal indices, so a copied
   meal index always lands on a real slot on every target day — no index-mismatch /
   append case to handle. (This is why the meal-count question was a non-issue.)
6. **Empty source meals can't be copied.** The copy affordance is hidden/disabled when
   the source meal has 0 entries (copying "nothing" would silently clear other days).
7. **Mutation shape is asymmetric:**
   - **Template editor** — slots live in local React state and are saved later by the
     existing full-replace `save_template` RPC. Copy is therefore a **pure client-side
     state operation** — no DB call, no new RPC. Atomicity is free (one save).
   - **Planner** — slots are live DB rows edited per-row. Copy-with-overwrite is a
     multi-row delete-then-insert across N target days that must be atomic, so it is a
     **new RPC** `copy_week_meal` (`SECURITY INVOKER`, `set search_path = public`).
     Note: this is single-table, so hard-invariant #3 (">1-table → RPC") does not
     strictly compel it — the RPC is chosen for **atomicity**, since a client-side
     delete + insert would be two non-atomic round trips and a partial failure would
     leave days half-copied.

## 3. The copy affordance

A small copy icon (lucide `Copy`) added to `SlotCell` via two new optional props:

```ts
// SlotCell additions
onCopy?: () => void;     // when provided AND entries.length > 0, render the icon
copyLabel?: string;      // aria-label / tooltip ("Copiar comida a otros días")
```

- **Planner** (`WeekGrid` → `SlotCell` with `mealLabel`): icon sits in the meal-label
  row, right-aligned next to the time. Clicking opens the modal for that
  `(date, mealIndex)`.
- **Template grid** (`TemplateGrid` → `SlotCell`, no `mealLabel`): the cell has no
  label row, so the icon renders **top-right of the cell, visible on hover/focus**
  (the matrix is dense; an always-on icon per cell is too noisy). Clicking opens the
  modal for that `(day_of_week, mealIndex)`.

`SlotCell` stays presentational — it only fires `onCopy`. The parent owns modal state.

## 4. The modal — `CopyMealDialog`

New surface-agnostic component `src/features/planning/components/CopyMealDialog.tsx`.
It knows nothing about templates vs weeks — the page supplies labels, candidate
targets, and the confirm handler.

```ts
interface CopyTarget {
  key: string;           // day_of_week (template) or ISO date (planner), as string
  label: string;         // "Martes" / "Martes" — localized day name
  sublabel?: string;     // planner only: "27 may"
  willOverwrite: boolean; // target already has ≥1 slot at this meal index
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLabel: string;     // "Desayuno (08:00) · lunes"
  entryCount: number;      // # recipes in the source meal (for the header)
  targets: CopyTarget[];   // already excludes the source day
  busy?: boolean;
  onConfirm: (selectedKeys: string[]) => void | Promise<void>;
}
```

Layout (matches the approved mockup): header with `sourceLabel` + entry count;
"Seleccionar todos" row (checkbox, indeterminate when partial); one row per target
with its checkbox, label/sublabel, and a `willOverwrite` amber pill; footer with a
live "N días seleccionados" count and Cancelar / Copiar buttons. Confirm disabled when
the selection is empty.

## 5. Wiring per surface

### Template editor (`PlantillaEditorPage`)
- Holds `copySource: { dayOfWeek, mealIndex } | null` modal state.
- `targets`: the other 6 `day_of_week`s; `willOverwrite` = any local slot exists at
  `(targetDay, mealIndex)`.
- On confirm, a **pure reducer** updates local `slots`:

```ts
// features/templates/copyMeal.ts (pure, Tier-1 tested)
function copyTemplateMeal(
  slots: TemplateSlotInput[],
  sourceDay: number,
  mealIndex: number,
  targetDays: number[],
): TemplateSlotInput[];
```

  For each target day: drop existing rows at `(day, mealIndex)`, then append copies of
  the source rows (new `rowId`s, same `recipe_id`/`recipe_name`/`servings`, preserved
  relative `display_order`). No DB call — the existing Save persists it.

### Planner (`PlanificadorPage`)
- Holds `copySource: { date, mealIndex } | null` modal state.
- `targets`: the other 6 dates of the active week; `willOverwrite` = any loaded slot at
  `(targetDate, mealIndex)`. All other days are candidates (past days are **not**
  special-cased — the grid already renders edit controls on them; low-stakes).
- On confirm, calls a new mutation → `copy_week_meal` RPC, then invalidates the active
  week query so the grid refetches.

```ts
// features/planner/api.ts
async function copyWeekMeal(input: {
  plan_week_id: string;
  source_date: string;     // ISO
  meal_index: number;
  target_dates: string[];  // ISO[]
}): Promise<void>;
```

## 6. The RPC — `copy_week_meal`

New migration. `SECURITY INVOKER`, `set search_path = public`. Signature:

```sql
copy_week_meal(
  p_plan_week_id uuid,
  p_source_date  date,
  p_meal_index   int,
  p_target_dates date[]
) returns void
```

Body (single statement-group, runs in the function's implicit transaction):
1. **Delete** `meal_plan_week_slots` where `plan_week_id = p_plan_week_id`
   AND `date = any(p_target_dates)` AND `meal_index = p_meal_index`.
2. **Insert** — for each target date, one copy of every source row
   (`select` source rows at `(p_plan_week_id, p_source_date, p_meal_index)`
   cross-joined with `unnest(p_target_dates)`), carrying `recipe_id`, `servings`,
   `meal_time`, `meal_index`, `display_order`; `date` = the target.

- **RLS is the security boundary.** `SECURITY INVOKER` means the function runs as the
  caller, so the existing `meal_plan_week_slots` RLS policies scope every row to the
  owner — a foreign `plan_week_id` simply matches nothing. No `user_id` arg, no
  in-function ownership check (consistent with the other slot mutations).
- Source meal-time is preserved; because meal periods are uniform, it equals the target
  day's existing meal_time at that index.
- If `p_target_dates` is empty the RPC is a no-op (defensive; the UI also blocks it).

## 7. i18n

New keys in the `planning` namespace (ES + EN), e.g. `copyMeal.title`,
`copyMeal.source` (interpolates meal label), `copyMeal.entryCount`,
`copyMeal.selectAll`, `copyMeal.willOverwrite`, `copyMeal.selectedCount`,
`copyMeal.confirm`, and the `SlotCell` copy icon `copyLabel`. Day names reuse the
existing `days.*` keys. No raw strings.

## 8. Testing

- **Tier-1 `copyMeal.test.ts`** (`copyTemplateMeal` reducer): overwrite replaces target
  rows (no duplication/merge); multi-day copy; preserved ordering and servings;
  copying onto an empty target adds rows; source day untouched; new `rowId`s issued.
- **Tier-1** target-builder helper (shared by both pages): `willOverwrite` true only
  when a target has ≥1 slot at the meal index; source day excluded from targets.
- **Tier-2 (`CopyMealDialog`)**: nothing selected on open; select-all toggles all and
  shows indeterminate on partial; overwrite pill renders only for `willOverwrite`
  targets; Copiar disabled at 0 selected; confirm fires with the selected keys.
- **RPC verification (manual / real DB):** mocked PostgREST tests can't cover the RPC
  or its `rpc()` call (see memory: *need integration + e2e guard*). Verify
  `copy_week_meal` against a real Supabase instance — overwrite, multi-day, empty
  source-meal guard at the UI, RLS scoping (cannot touch another user's week). The
  seeded QA user + agent-browser harness can drive the planner end-to-end.

## 9. Risks / notes

- **Asymmetric mutation** is deliberate (template = local state, planner = RPC). The
  shared piece is `CopyMealDialog` + the target-builder; the persistence differs.
- **Overwrite is destructive** on the planner (deletes real rows). Mitigated by the
  in-modal `willOverwrite` badges; no separate confirm step (matches the approved UX).
- **Past days** in the planner are valid targets (not special-cased). Revisit only if
  it proves confusing.
- **No new tables/columns**; one new RPC and one new client mutation. Template path
  adds no DB surface at all.
```
