# Copy a Meal Across Days (U-6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user duplicate one planned meal onto chosen other days, in both the template editor and the week planner, via a copy icon → day-picker modal.

**Architecture:** A shared presentational `CopyMealDialog` plus two pure helpers (a template-state reducer and target builders). The template editor copies in local React state (persisted later by the existing `save_template`); the planner copies live rows through a new atomic `copy_week_meal` RPC. `SlotCell` gains an optional copy affordance; the two grids pass it through; the two pages own the modal state and the mutation.

**Tech Stack:** React 18 + TS, react-query, react-i18next, date-fns, Radix Dialog (`@/components/ui/dialog`), Supabase (PL/pgSQL RPC), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-24-copy-meal-across-days-design.md`

---

## File Structure

- Create: `src/features/templates/copyMeal.ts` — pure reducer `copyTemplateMeal`
- Create: `src/features/templates/copyMeal.test.ts` — Tier-1 tests
- Create: `src/features/planning/copyTargets.ts` — pure `templateMealTargets` / `weekMealTargets`
- Create: `src/features/planning/copyTargets.test.ts` — Tier-1 tests
- Create: `supabase/migrations/20260527120000_u6_copy_week_meal.sql` — `copy_week_meal` RPC (staged)
- Create: `src/features/planning/components/CopyMealDialog.tsx` — modal
- Create: `src/features/planning/components/CopyMealDialog.test.tsx` — Tier-2 tests
- Create: `src/features/planning/components/SlotCell.test.tsx` — Tier-2 copy-icon test
- Modify: `src/features/planner/api.ts` — add `copyWeekMeal`
- Modify: `src/features/planner/hooks.ts` — add `useCopyWeekMeal`
- Modify: `src/features/planning/components/SlotCell.tsx` — `onCopy` / `copyLabel` + icon
- Modify: `src/features/planning/components/WeekGrid.tsx` — `onCopyMeal` passthrough
- Modify: `src/features/planning/components/TemplateGrid.tsx` — `onCopyMeal` passthrough
- Modify: `src/pages/PlanificadorPage.tsx` — wire modal + `useCopyWeekMeal`
- Modify: `src/pages/PlantillaEditorPage.tsx` — wire modal + `copyTemplateMeal`
- Modify: `src/i18n/es/planning.json`, `src/i18n/en/planning.json` — `slot.copy` + `copyMeal.*`

---

## Task 1: Pure template-copy reducer

**Files:**
- Create: `src/features/templates/copyMeal.ts`
- Test: `src/features/templates/copyMeal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/templates/copyMeal.test.ts
import { describe, it, expect } from 'vitest';
import { copyTemplateMeal } from './copyMeal';
import type { TemplateSlotInput } from '@/features/planning/components/TemplateGrid';

let n = 0;
const rid = () => `new-${(n += 1)}`;

function slot(p: Partial<TemplateSlotInput> & { day_of_week: number; meal_index: number }): TemplateSlotInput {
  return {
    rowId: `r${Math.random()}`,
    recipe_id: 'rec',
    recipe_name: 'Recipe',
    servings: 1,
    display_order: 0,
    ...p,
  };
}

describe('copyTemplateMeal', () => {
  it('copies the source meal onto each target day with new rowIds', () => {
    n = 0;
    const slots = [
      slot({ day_of_week: 0, meal_index: 1, recipe_id: 'a', recipe_name: 'A', display_order: 0 }),
      slot({ day_of_week: 0, meal_index: 1, recipe_id: 'b', recipe_name: 'B', display_order: 1 }),
    ];
    const out = copyTemplateMeal(slots, 0, 1, [2, 3], rid);
    const tue = out.filter((s) => s.day_of_week === 2 && s.meal_index === 1);
    const wed = out.filter((s) => s.day_of_week === 3 && s.meal_index === 1);
    expect(tue.map((s) => s.recipe_id)).toEqual(['a', 'b']);
    expect(wed.map((s) => s.recipe_id)).toEqual(['a', 'b']);
    expect(tue.map((s) => s.display_order)).toEqual([0, 1]);
    expect(tue.every((s) => s.rowId.startsWith('new-'))).toBe(true);
  });

  it('overwrites existing target rows at that meal index (replace, not merge)', () => {
    n = 0;
    const slots = [
      slot({ day_of_week: 0, meal_index: 1, recipe_id: 'a', recipe_name: 'A' }),
      slot({ day_of_week: 2, meal_index: 1, recipe_id: 'old', recipe_name: 'Old' }),
    ];
    const out = copyTemplateMeal(slots, 0, 1, [2], rid);
    const tue = out.filter((s) => s.day_of_week === 2 && s.meal_index === 1);
    expect(tue.map((s) => s.recipe_id)).toEqual(['a']);
  });

  it('leaves the source day and other meal indices untouched', () => {
    n = 0;
    const slots = [
      slot({ day_of_week: 0, meal_index: 1, recipe_id: 'a' }),
      slot({ day_of_week: 0, meal_index: 2, recipe_id: 'lunch' }),
      slot({ day_of_week: 2, meal_index: 2, recipe_id: 'keep' }),
    ];
    const out = copyTemplateMeal(slots, 0, 1, [2], rid);
    expect(out.filter((s) => s.day_of_week === 0).length).toBe(2);
    expect(out.find((s) => s.day_of_week === 2 && s.meal_index === 2)?.recipe_id).toBe('keep');
  });

  it('copying an empty source meal clears the target meal', () => {
    n = 0;
    const slots = [slot({ day_of_week: 2, meal_index: 1, recipe_id: 'old' })];
    const out = copyTemplateMeal(slots, 0, 1, [2], rid);
    expect(out.filter((s) => s.day_of_week === 2 && s.meal_index === 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/templates/copyMeal.test.ts`
Expected: FAIL — `copyTemplateMeal` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/templates/copyMeal.ts
import type { TemplateSlotInput } from '@/features/planning/components/TemplateGrid';

/**
 * Duplicate one meal (all rows at `(sourceDay, mealIndex)`) onto each target day,
 * replacing whatever those days had at `mealIndex`. Pure: callers pass a rowId
 * factory so the result is deterministic in tests. The source day is never a target.
 */
export function copyTemplateMeal(
  slots: TemplateSlotInput[],
  sourceDay: number,
  mealIndex: number,
  targetDays: number[],
  newRowId: () => string,
): TemplateSlotInput[] {
  const targets = new Set(targetDays.filter((d) => d !== sourceDay));

  const source = slots
    .filter((s) => s.day_of_week === sourceDay && s.meal_index === mealIndex)
    .sort((a, b) => a.display_order - b.display_order);

  // Drop existing rows at (target, mealIndex); keep everything else.
  const kept = slots.filter(
    (s) => !(targets.has(s.day_of_week) && s.meal_index === mealIndex),
  );

  const copies: TemplateSlotInput[] = [];
  for (const day of targets) {
    source.forEach((s, i) => {
      copies.push({
        rowId: newRowId(),
        day_of_week: day,
        meal_index: mealIndex,
        recipe_id: s.recipe_id,
        recipe_name: s.recipe_name,
        servings: s.servings,
        display_order: i,
      });
    });
  }

  return [...kept, ...copies];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/templates/copyMeal.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/templates/copyMeal.ts src/features/templates/copyMeal.test.ts
git commit -m "feat(u6): pure copyTemplateMeal reducer (overwrite-by-meal-index)"
```

---

## Task 2: Pure copy-target builders

**Files:**
- Create: `src/features/planning/copyTargets.ts`
- Test: `src/features/planning/copyTargets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/planning/copyTargets.test.ts
import { describe, it, expect } from 'vitest';
import { templateMealTargets, weekMealTargets } from './copyTargets';

describe('templateMealTargets', () => {
  it('lists the other 6 days in Mon..Sun order and flags overwrite', () => {
    const slots = [
      { day_of_week: 0, meal_index: 1 }, // source
      { day_of_week: 2, meal_index: 1 }, // Wed already has this meal
      { day_of_week: 3, meal_index: 2 }, // Thu has a different meal only
    ];
    const out = templateMealTargets(slots, 0, 1);
    expect(out.map((t) => t.key)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(out.find((t) => t.key === '2')?.willOverwrite).toBe(true);
    expect(out.find((t) => t.key === '3')?.willOverwrite).toBe(false);
  });
});

describe('weekMealTargets', () => {
  const week = [
    '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28',
    '2026-05-29', '2026-05-30', '2026-05-31',
  ];
  it('excludes the source date and flags overwrite per date', () => {
    const slots = [
      { date: '2026-05-25', meal_index: 0 }, // source
      { date: '2026-05-26', meal_index: 0 }, // Tue occupied
    ];
    const out = weekMealTargets(slots, week, '2026-05-25', 0);
    expect(out.map((t) => t.key)).toEqual(week.slice(1));
    expect(out.find((t) => t.key === '2026-05-26')?.willOverwrite).toBe(true);
    expect(out.find((t) => t.key === '2026-05-27')?.willOverwrite).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/planning/copyTargets.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/planning/copyTargets.ts

/** A copy candidate: a stringified day-of-week (template) or ISO date (planner). */
export interface RawCopyTarget {
  key: string;
  willOverwrite: boolean;
}

/** Other 6 days of the week (Mon..Sun), flagging days that already have this meal. */
export function templateMealTargets(
  slots: { day_of_week: number; meal_index: number }[],
  sourceDay: number,
  mealIndex: number,
): RawCopyTarget[] {
  const out: RawCopyTarget[] = [];
  for (let day = 0; day < 7; day += 1) {
    if (day === sourceDay) continue;
    out.push({
      key: String(day),
      willOverwrite: slots.some((s) => s.day_of_week === day && s.meal_index === mealIndex),
    });
  }
  return out;
}

/** Other dates of the active week, flagging dates that already have this meal. */
export function weekMealTargets(
  slots: { date: string; meal_index: number }[],
  weekDates: string[],
  sourceDate: string,
  mealIndex: number,
): RawCopyTarget[] {
  return weekDates
    .filter((d) => d !== sourceDate)
    .map((d) => ({
      key: d,
      willOverwrite: slots.some((s) => s.date === d && s.meal_index === mealIndex),
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/planning/copyTargets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/copyTargets.ts src/features/planning/copyTargets.test.ts
git commit -m "feat(u6): pure copy-target builders (template + week)"
```

---

## Task 3: `copy_week_meal` RPC + client wiring

**Files:**
- Create: `supabase/migrations/20260527120000_u6_copy_week_meal.sql`
- Modify: `src/features/planner/api.ts` (append after `deleteWeekSlot`, end of file)
- Modify: `src/features/planner/hooks.ts`

- [ ] **Step 1: Write the migration (staged — do not auto-apply)**

```sql
-- supabase/migrations/20260527120000_u6_copy_week_meal.sql
-- U-6 — copy one planned meal onto other days of the active week.
--
-- STAGED — DO NOT AUTO-APPLY. Specced in
-- `docs/superpowers/specs/2026-05-24-copy-meal-across-days-design.md` §6;
-- sequenced by `docs/superpowers/plans/2026-05-24-copy-meal-across-days.md` Task 3.
--
-- Copy-with-overwrite is a multi-row delete-then-insert across N target days
-- that must be atomic. Single table, so invariant #3 (>1-table) does not compel
-- it — the RPC is chosen for atomicity (a client delete+insert would be two
-- non-atomic round trips). SECURITY INVOKER + canonical `set search_path`;
-- RLS on meal_plan_week_slots is the sole security boundary.
--
-- Do not run this against any database from CI or from this PR.

create or replace function public.copy_week_meal(
  p_plan_week_id uuid,
  p_source_date  date,
  p_meal_index   int,
  p_target_dates date[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Replace target days' slots at this meal index (RLS scopes to the owner).
  delete from public.meal_plan_week_slots
   where plan_week_id = p_plan_week_id
     and meal_index   = p_meal_index
     and date = any (p_target_dates);

  -- Copy the source meal's rows onto each target date.
  insert into public.meal_plan_week_slots
    (plan_week_id, date, meal_index, meal_time, recipe_id, servings, display_order)
  select src.plan_week_id,
         tgt.d,
         src.meal_index,
         src.meal_time,
         src.recipe_id,
         src.servings,
         src.display_order
  from public.meal_plan_week_slots src
  cross join unnest (p_target_dates) as tgt(d)
  where src.plan_week_id = p_plan_week_id
    and src.date         = p_source_date
    and src.meal_index   = p_meal_index;
end;
$$;

grant execute on function public.copy_week_meal(uuid, date, int, date[]) to authenticated;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop function if exists public.copy_week_meal(uuid, date, int, date[]);
```

- [ ] **Step 2: Add the client API call**

Append to the end of `src/features/planner/api.ts`:

```ts
export async function copyWeekMeal(input: {
  plan_week_id: string;
  source_date: string;
  meal_index: number;
  target_dates: string[];
}): Promise<void> {
  const { error } = await supabase.rpc('copy_week_meal', {
    p_plan_week_id: input.plan_week_id,
    p_source_date: input.source_date,
    p_meal_index: input.meal_index,
    p_target_dates: input.target_dates,
  });
  if (error) throw error;
}
```

- [ ] **Step 3: Add the react-query mutation hook**

In `src/features/planner/hooks.ts`, add `copyWeekMeal` to the import block from `./api`:

```ts
import {
  addWeekSlot,
  applyTemplateToWeek,
  copyWeekMeal,
  deleteWeekSlot,
  fetchActiveWeek,
  fetchWeekShopping,
  saveWeekAsTemplate,
  updateWeekSlot,
} from './api';
```

And append this hook at the end of the file:

```ts
export function useCopyWeekMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: copyWeekMeal,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
      toastSaved();
    },
    onError: toastError,
  });
}
```

(`toastSaved` and `toastError` are already imported at the top of the file.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — note `supabase.rpc('copy_week_meal', …)` is untyped against generated types until the migration is applied + types regenerated (Task 9); the call compiles because `rpc` accepts a string name. If `typecheck` errors on the RPC name, cast args via `as never` is NOT needed — confirm the error and fix in Task 9's type-regen step.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260527120000_u6_copy_week_meal.sql src/features/planner/api.ts src/features/planner/hooks.ts
git commit -m "feat(u6): copy_week_meal RPC + client mutation (staged migration)"
```

---

## Task 4: `SlotCell` copy affordance + grid passthrough

**Files:**
- Modify: `src/features/planning/components/SlotCell.tsx`
- Modify: `src/features/planning/components/WeekGrid.tsx`
- Modify: `src/features/planning/components/TemplateGrid.tsx`
- Test: `src/features/planning/components/SlotCell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/SlotCell.test.tsx
import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlotCell, type SlotEntry } from './SlotCell';

const entry: SlotEntry = { id: '1', recipe_id: 'r', recipe_name: 'Avena', servings: 1 };
const noop = () => {};

describe('SlotCell copy affordance', () => {
  it('renders the copy button when onCopy is set and there is ≥1 entry', () => {
    render(
      <SlotCell
        entries={[entry]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
        onCopy={vi.fn()}
        copyLabel="Copiar comida"
      />,
    );
    expect(screen.getByRole('button', { name: 'Copiar comida' })).toBeInTheDocument();
  });

  it('hides the copy button when the meal is empty', () => {
    render(
      <SlotCell
        entries={[]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
        onCopy={vi.fn()}
        copyLabel="Copiar comida"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Copiar comida' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/planning/components/SlotCell.test.tsx`
Expected: FAIL — `onCopy`/`copyLabel` props don't exist, no copy button rendered.

- [ ] **Step 3: Add the affordance to `SlotCell`**

In `src/features/planning/components/SlotCell.tsx`, change the `Plus, X` import to add `Copy`:

```ts
import { Copy, Plus, X } from 'lucide-react';
```

Add two props to the `Props` interface (after `busy?: boolean;`):

```ts
  onCopy?: () => void;
  copyLabel?: string;
```

Add them to the destructured params (after `busy,`):

```ts
  onCopy,
  copyLabel,
```

Inside the component body, before the `return`, compute:

```ts
  const showCopy = !!onCopy && entries.length > 0;
```

Replace the container opening div and the `mealLabel` block. Current:

```tsx
    <div className={cn('rounded-md border bg-card p-2 space-y-1.5', className)}>
      {mealLabel && (
        <div className="text-xs font-medium text-muted-foreground tabular-nums">
          {mealLabel}
        </div>
      )}
```

with:

```tsx
    <div className={cn('relative group rounded-md border bg-card p-2 space-y-1.5', className)}>
      {mealLabel ? (
        <div className="flex items-center justify-between gap-1">
          <div className="text-xs font-medium text-muted-foreground tabular-nums">
            {mealLabel}
          </div>
          {showCopy && (
            <button
              type="button"
              onClick={onCopy}
              aria-label={copyLabel}
              title={copyLabel}
              disabled={busy}
              className="shrink-0 text-muted-foreground opacity-60 hover:opacity-100"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        showCopy && (
          <button
            type="button"
            onClick={onCopy}
            aria-label={copyLabel}
            title={copyLabel}
            disabled={busy}
            className="absolute right-1 top-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          >
            <Copy className="h-3 w-3" />
          </button>
        )
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/planning/components/SlotCell.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the passthrough to `WeekGrid`**

In `src/features/planning/components/WeekGrid.tsx`, add to the `Props` interface (after `busy?: boolean;`):

```ts
  onCopyMeal?: (date: string, mealIndex: number) => void;
```

Add `onCopyMeal` to the destructured params (after `busy,`). Then on the `<SlotCell>` inside the `buckets.map`, add these two props:

```tsx
                    onCopy={onCopyMeal ? () => onCopyMeal(day.date, bucket.mealIndex) : undefined}
                    copyLabel={t('slot.copy')}
```

- [ ] **Step 6: Add the passthrough to `TemplateGrid`**

In `src/features/planning/components/TemplateGrid.tsx`, add to the `Props` interface (after `onRemove: ...;`):

```ts
  onCopyMeal?: (dayOfWeek: number, mealIndex: number) => void;
```

Add `onCopyMeal` to the destructured params. Then on the `<SlotCell>` inside the inner `DAY_KEYS.map`, add:

```tsx
                onCopy={onCopyMeal ? () => onCopyMeal(dayIdx, mealIdx) : undefined}
                copyLabel={t('slot.copy')}
```

- [ ] **Step 7: Typecheck (translation key added in Task 5; t() tolerates a missing key at runtime)**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/planning/components/SlotCell.tsx src/features/planning/components/SlotCell.test.tsx src/features/planning/components/WeekGrid.tsx src/features/planning/components/TemplateGrid.tsx
git commit -m "feat(u6): SlotCell copy affordance + grid passthrough"
```

---

## Task 5: i18n keys

**Files:**
- Modify: `src/i18n/es/planning.json`
- Modify: `src/i18n/en/planning.json`

- [ ] **Step 1: Add the Spanish keys**

In `src/i18n/es/planning.json`, add `"copy": "Copiar comida a otros días"` to the existing `"slot"` object (alongside `add`/`remove`), and add a new top-level `"copyMeal"` block:

```json
  "copyMeal": {
    "title": "Copiar comida a otros días",
    "entryCount": "{{count}} recetas",
    "selectAll": "Seleccionar todos",
    "willOverwrite": "se sobrescribirá",
    "selectedCount": "{{count}} días seleccionados",
    "confirm": "Copiar"
  }
```

- [ ] **Step 2: Add the English keys**

In `src/i18n/en/planning.json`, add `"copy": "Copy meal to other days"` to the `"slot"` object, and:

```json
  "copyMeal": {
    "title": "Copy meal to other days",
    "entryCount": "{{count}} recipes",
    "selectAll": "Select all",
    "willOverwrite": "will be overwritten",
    "selectedCount": "{{count}} days selected",
    "confirm": "Copy"
  }
```

- [ ] **Step 3: Verify both files parse**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/es/planning.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/en/planning.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "feat(u6): i18n keys for copy-meal modal + copy icon"
```

---

## Task 6: `CopyMealDialog` component

**Files:**
- Create: `src/features/planning/components/CopyMealDialog.tsx`
- Test: `src/features/planning/components/CopyMealDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/CopyMealDialog.test.tsx
import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyMealDialog, type CopyTarget } from './CopyMealDialog';

const targets: CopyTarget[] = [
  { key: 'tue', label: 'Martes', sublabel: '27 may', willOverwrite: true },
  { key: 'wed', label: 'Miércoles', sublabel: '28 may', willOverwrite: false },
  { key: 'thu', label: 'Jueves', sublabel: '29 may', willOverwrite: false },
];

function setup(onConfirm = vi.fn()) {
  render(
    <CopyMealDialog
      open
      onOpenChange={() => {}}
      sourceLabel="Desayuno (08:00) · lunes"
      entryCount={2}
      targets={targets}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('CopyMealDialog', () => {
  it('starts with nothing selected and confirm disabled', () => {
    setup();
    const confirm = screen.getByRole('button', { name: /copiar|copy/i });
    expect(confirm).toBeDisabled();
    targets.forEach((t) => {
      expect(screen.getByRole('checkbox', { name: new RegExp(t.label) })).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('shows the overwrite badge only on occupied targets', () => {
    setup();
    expect(screen.getAllByText(/sobrescrib|overwritten/i)).toHaveLength(1);
  });

  it('select-all checks every day and confirm returns all keys', async () => {
    const user = userEvent.setup();
    const onConfirm = setup();
    await user.click(screen.getByRole('checkbox', { name: /seleccionar todos|select all/i }));
    await user.click(screen.getByRole('button', { name: /copiar|copy/i }));
    expect(onConfirm).toHaveBeenCalledWith(['tue', 'wed', 'thu']);
  });

  it('toggling one day enables confirm and returns just that key', async () => {
    const user = userEvent.setup();
    const onConfirm = setup();
    await user.click(screen.getByRole('checkbox', { name: /Miércoles/ }));
    const confirm = screen.getByRole('button', { name: /copiar|copy/i });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(['wed']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/planning/components/CopyMealDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dialog**

```tsx
// src/features/planning/components/CopyMealDialog.tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CopyTarget {
  key: string;
  label: string;
  sublabel?: string;
  willOverwrite: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLabel: string;
  entryCount: number;
  targets: CopyTarget[];
  busy?: boolean;
  onConfirm: (selectedKeys: string[]) => void | Promise<void>;
}

function Box({ state }: { state: 'on' | 'off' | 'some' }) {
  return (
    <span
      className={cn(
        'flex h-4 w-4 items-center justify-center rounded border',
        state === 'off' ? 'border-muted-foreground/50' : 'border-primary bg-primary text-primary-foreground',
      )}
    >
      {state === 'on' && <Check className="h-3 w-3" />}
      {state === 'some' && <span className="h-0.5 w-2 bg-primary-foreground" />}
    </span>
  );
}

export function CopyMealDialog({
  open,
  onOpenChange,
  sourceLabel,
  entryCount,
  targets,
  busy,
  onConfirm,
}: Props) {
  const { t } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const allSelected = targets.length > 0 && selected.size === targets.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === targets.length ? new Set() : new Set(targets.map((tg) => tg.key)),
    );
  }

  async function confirm() {
    // Preserve target order in the emitted keys.
    await onConfirm(targets.filter((tg) => selected.has(tg.key)).map((tg) => tg.key));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('copyMeal.title')}</DialogTitle>
          <DialogDescription>
            {sourceLabel} · {t('copyMeal.entryCount', { count: entryCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <button
            type="button"
            role="checkbox"
            aria-checked={allSelected ? 'true' : someSelected ? 'mixed' : 'false'}
            aria-label={t('copyMeal.selectAll')}
            onClick={toggleAll}
            className="flex w-full items-center gap-3 border-b border-dashed py-2 text-sm font-semibold"
          >
            <Box state={allSelected ? 'on' : someSelected ? 'some' : 'off'} />
            <span>{t('copyMeal.selectAll')}</span>
          </button>

          <div className="max-h-60 overflow-auto">
            {targets.map((tg) => {
              const on = selected.has(tg.key);
              return (
                <button
                  key={tg.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on ? 'true' : 'false'}
                  aria-label={tg.label}
                  onClick={() => toggle(tg.key)}
                  className="flex w-full items-center gap-3 border-b py-2.5 text-sm last:border-b-0"
                >
                  <Box state={on ? 'on' : 'off'} />
                  <span className="flex-1 text-left">
                    {tg.label}
                    {tg.sublabel && (
                      <span className="ml-2 text-xs text-muted-foreground">{tg.sublabel}</span>
                    )}
                  </span>
                  {tg.willOverwrite && (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      {t('copyMeal.willOverwrite')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="mt-2 items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {t('copyMeal.selectedCount', { count: selected.size })}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="button" onClick={confirm} disabled={busy || selected.size === 0}>
              {busy ? tCommon('loading') : t('copyMeal.confirm')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/planning/components/CopyMealDialog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/CopyMealDialog.tsx src/features/planning/components/CopyMealDialog.test.tsx
git commit -m "feat(u6): CopyMealDialog (day picker + select-all + overwrite badges)"
```

---

## Task 7: Wire the planner (`PlanificadorPage`)

**Files:**
- Modify: `src/pages/PlanificadorPage.tsx`

- [ ] **Step 1: Add imports**

Add to the top of `src/pages/PlanificadorPage.tsx`:

```ts
import { addDays, parseISO } from 'date-fns';
import { CopyMealDialog, type CopyTarget } from '@/features/planning/components/CopyMealDialog';
import { weekMealTargets } from '@/features/planning/copyTargets';
```

Add `useCopyWeekMeal` to the existing `@/features/planner/hooks` import list.

- [ ] **Step 2: Add state + mutation + handlers**

After the existing `const [shoppingOpen, setShoppingOpen] = useState(false);` line, add:

```ts
  const copyMeal = useCopyWeekMeal();
  const [copySource, setCopySource] = useState<{ date: string; mealIndex: number } | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    formatDate(addDays(parseISO(weekStart), i), 'yyyy-MM-dd', locale),
  );

  const copyTargets: CopyTarget[] = copySource
    ? weekMealTargets(week.data?.slots ?? [], weekDates, copySource.date, copySource.mealIndex).map(
        (tg) => ({
          key: tg.key,
          label: capitalize(formatDate(parseISO(tg.key), 'EEEE', locale)),
          sublabel: formatDate(parseISO(tg.key), 'd MMM', locale),
          willOverwrite: tg.willOverwrite,
        }),
      )
    : [];

  const copyEntries = copySource
    ? (week.data?.slots ?? []).filter(
        (s) => s.date === copySource.date && s.meal_index === copySource.mealIndex,
      )
    : [];

  const copySourceLabel = copySource
    ? `${copyEntries[0]?.meal_time?.slice(0, 5) ?? ''} · ${capitalize(formatDate(parseISO(copySource.date), 'EEEE', locale))}`.trim()
    : '';
```

Add this small helper above the `PlanificadorPage` function (module scope):

```ts
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 3: Pass `onCopyMeal` to `WeekGrid`**

On the `<WeekGrid ... />`, add the prop:

```tsx
            onCopyMeal={(date, mealIndex) => setCopySource({ date, mealIndex })}
```

- [ ] **Step 4: Render the dialog**

After the `<ShoppingListDialog ... />` element, add:

```tsx
      <CopyMealDialog
        open={!!copySource}
        onOpenChange={(o) => !o && setCopySource(null)}
        sourceLabel={copySourceLabel}
        entryCount={copyEntries.length}
        targets={copyTargets}
        busy={copyMeal.isPending}
        onConfirm={async (keys) => {
          if (!copySource || !week.data) return;
          await copyMeal.mutateAsync({
            plan_week_id: week.data.id,
            source_date: copySource.date,
            meal_index: copySource.mealIndex,
            target_dates: keys,
          });
        }}
      />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PlanificadorPage.tsx
git commit -m "feat(u6): wire copy-meal into the week planner"
```

---

## Task 8: Wire the template editor (`PlantillaEditorPage`)

**Files:**
- Modify: `src/pages/PlantillaEditorPage.tsx`

- [ ] **Step 1: Add imports**

Add to the top of `src/pages/PlantillaEditorPage.tsx`:

```ts
import { addDays } from 'date-fns';
import { CopyMealDialog, type CopyTarget } from '@/features/planning/components/CopyMealDialog';
import { templateMealTargets } from '@/features/planning/copyTargets';
import { copyTemplateMeal } from '@/features/templates/copyMeal';
import { formatDate, mondayOf, type Locale } from '@/lib/dates';
```

In the existing `useTranslation('planning')` call, capture the locale: change

```ts
  const { t } = useTranslation('planning');
```

to

```ts
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
```

- [ ] **Step 2: Add copy state + derived values + handler**

After `const [slots, setSlots] = useState<TemplateSlotInput[]>([]);`, add:

```ts
  const [copySource, setCopySource] = useState<{ dayOfWeek: number; mealIndex: number } | null>(null);

  // Reference Monday so day-of-week → full localized weekday label (no date involved).
  const refMonday = mondayOf(new Date());
  const dayLabel = (dow: number) =>
    capitalizeTpl(formatDate(addDays(refMonday, dow), 'EEEE', locale));

  const copyTargets: CopyTarget[] = copySource
    ? templateMealTargets(slots, copySource.dayOfWeek, copySource.mealIndex).map((tg) => ({
        key: tg.key,
        label: dayLabel(Number(tg.key)),
        willOverwrite: tg.willOverwrite,
      }))
    : [];

  const copyEntries = copySource
    ? slots.filter(
        (s) => s.day_of_week === copySource.dayOfWeek && s.meal_index === copySource.mealIndex,
      )
    : [];

  const copySourceLabel = copySource
    ? `${mealTimes[copySource.mealIndex] ?? ''} · ${dayLabel(copySource.dayOfWeek)}`.trim()
    : '';

  function handleCopyMeal(keys: string[]) {
    if (!copySource) return;
    setSlots((s) =>
      copyTemplateMeal(s, copySource.dayOfWeek, copySource.mealIndex, keys.map(Number), newRowId),
    );
  }
```

Add this helper at module scope (below `newRowId`):

```ts
function capitalizeTpl(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 3: Pass `onCopyMeal` to `TemplateGrid`**

On the `<TemplateGrid ... />`, add:

```tsx
            onCopyMeal={(dayOfWeek, mealIndex) => setCopySource({ dayOfWeek, mealIndex })}
```

- [ ] **Step 4: Render the dialog**

Immediately before the closing `</form>` tag, add:

```tsx
      <CopyMealDialog
        open={!!copySource}
        onOpenChange={(o) => !o && setCopySource(null)}
        sourceLabel={copySourceLabel}
        entryCount={copyEntries.length}
        targets={copyTargets}
        onConfirm={handleCopyMeal}
      />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PlantillaEditorPage.tsx
git commit -m "feat(u6): wire copy-meal into the template editor"
```

---

## Task 9: Full verification + RPC against a real DB

**Files:** none (verification + type regen).

- [ ] **Step 1: Run the full local gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all PASS. Fix any failures before continuing.

- [ ] **Step 2: Apply the migration to the Supabase preview/develop project**

The migration is staged (header says do-not-auto-apply). Apply it to the non-prod project and regenerate types. Using the Supabase MCP (or `supabase db push` against the preview project), apply `20260527120000_u6_copy_week_meal.sql`, then regenerate `src/types/database.ts`. If `pnpm typecheck` flagged the `rpc('copy_week_meal', …)` call in Task 3, it should now resolve against the regenerated types; re-run `pnpm typecheck`.

Reference: memory *edge deploy command* / *need integration + e2e guard* — mocked tests don't cover the RPC or the `rpc()` select string, so it must be exercised against a real DB.

- [ ] **Step 3: Manually verify the RPC (real DB, seeded QA user)**

Using the planner for the seeded QA user (`qa-bot@hudsonsfitness.app`, see memory *agent-browser e2e*):
- Copy a populated breakfast onto two empty days → both gain identical slots; source unchanged.
- Copy onto a day that already has a breakfast → that day's breakfast is **replaced** (not duplicated/merged); the modal showed its overwrite badge.
- Confirm RLS: a `copy_week_meal` call with another user's `plan_week_id` copies nothing (no rows touched).
- Template editor: copy a meal across days, then Save → reload the template and confirm the copied meals persisted via `save_template`.

- [ ] **Step 4: Push the branch and open the PR into `develop`**

```bash
git push -u origin claude/u6-copy-meal-spec
gh pr create --base develop --title "feat(u6): copy a meal across days (planner + template editor)" --body "Implements U-6 per docs/superpowers/specs/2026-05-24-copy-meal-across-days-design.md. Copy icon on a meal opens a day-picker modal; template copy is local state, planner copy is the new atomic copy_week_meal RPC."
```

Expected: CI (`lint-build`, tests) green, then squash-merge per the ship flow. Do not `--auto` while still pushing commits (memory: *develop CI gate*).

---

## Notes for the implementer

- **Branch:** work continues on `claude/u6-copy-meal-spec` (the spec commit lives there). It is based on a `develop` that is ~13 commits behind `origin/develop`; rebase onto `origin/develop` before opening the PR so the diff is clean.
- **No new tables/columns** — one new RPC (`copy_week_meal`) and one new client mutation. The template path adds no DB surface.
- **`day_of_week` is 0=Mon … 6=Sun**, matching `TemplateGrid`'s `DAY_KEYS` order and the reference-Monday label trick.
- **Tier split:** `*.test.ts` (Tasks 1–2) run in Node; `*.test.tsx` (Tasks 4, 6) run in jsdom and must `import '@/i18n'` first (see `src/test/setup.ts`).
