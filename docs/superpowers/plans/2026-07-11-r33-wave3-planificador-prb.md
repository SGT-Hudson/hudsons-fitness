# R-33 Wave 3 PR-B — Planificador flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the planner's three interactions on the redesigned view PR-A
shipped: add a recipe to a plan slot (drawer with a live day-balance footer),
copy a meal to other days (7-day multiselect with a new *append* mode), and
peek a recipe from a plan cell (docked panel).

**Architecture:** One shared `ResponsiveDialog` (vaul `Drawer` below `md`,
`Dialog` at `md+`) absorbs the drawer/dialog duplication that exists today in
`AddToDaySheet` and `ExerciseInfoButton`, and hosts all three new surfaces.
`RecipePickerDialog` stops being used by the planner (it survives — the
template editor's `SlotCell` still mounts it). The add drawer projects the
target day's balance purely client-side: `useRecipes` already carries
`perServing` macros for every recipe, and the page already has each day's
totals — no new query. **Append** is a single-table, multi-row `insert()`, so
it needs no RPC and no migration (hard invariant 3 governs >1-table mutations).

**Tech Stack:** React 18 + TS, Tailwind v4 `@theme` tokens, shadcn/ui
(Dialog, Drawer, Popover, Tabs), react-i18next (`planning` namespace),
TanStack Query, Vitest + Testing Library.

## Global Constraints

- **Metric only** (kg/cm/g).
- **No schema / RLS / RPC change, and no new PostgREST `.select()` string.**
  Replace-copy keeps calling the existing `copy_week_meal` RPC; append is a
  plain `insert()` of rows into `meal_plan_week_slots` (one table, one
  statement ⇒ atomic ⇒ invariant 3 does not apply). The recipe peek reuses the
  existing `useRecipe` / `fetchRecipe` detail query as-is.
- **Every new string in ES *and* EN** (`src/i18n/{es,en}/planning.json`), same
  key shape.
- **Zero hardcoded colours** — no hex, no Tailwind default-palette classes.
  Only `@theme` tokens (`tone-*`, `excess-*`, `macro-*`, `accent-*`, `phase-*`,
  `text-dim`, `muted`, `destructive`, `border`, `card`).
- **Numbers carry `tnum`.** Icon-only controls carry an accessible name.
- **`PageShell` mounts the mobile header AND `PageHeaderV2` at once** — page
  tests must use `getAllBy*`. Do not "fix" it.
- `pnpm lint` + `pnpm build` + `pnpm test` green before any push.
- **No AI/Claude attribution anywhere** — plain conventional commits.
- **Do not open the PR until every gate has passed, the visual pass included.**
  A repo workflow auto-merges a `claude/*` PR the moment CI turns green; there
  is no human gate. Opening early is how PR-A shipped a broken header.

## Source authority

- Canvas add drawer (V1, "balance en vivo"): `/mnt/d/dev/claude-design-hudson-fitness/src/planificador-add-drawer.jsx` (`AñadirRecetaDrawerV1`); mobile twin in `.../planificador-mobile-detail.jsx` (`PlaniAddSheet`).
- Canvas copy popover: `.../src/planificador-copy-modal.jsx` (`CopyMealPopover`).
- Canvas recipe peek: `.../src/planificador-recipe-peek.jsx` (option 3, `DockedRecipeStage`).
- Spec: `docs/superpowers/specs/2026-07-02-r33-ui-redesign-design.md` §6 wave 3.
- PR-A plan (its strip-list still binds): `docs/superpowers/plans/2026-07-11-r33-wave3-planificador.md`.

## Decisions locked before implementation

| Decision | Why |
|---|---|
| **Append is client-side**, not an RPC | It inserts into one table in one statement. Gonzalo chose this over changing `copy_week_meal` (R-33 declares no RPC changes) and over dropping the feature. |
| **Copy UI is page-level, in a `ResponsiveDialog`** — NOT a popover anchored to the cell's copy button | The canvas anchors a popover with a tail pointing at the source cell. Anchoring would force the target computation and the copy mutation down through `WeekGrid` → `PlannerMealCell` for a purely decorative tail. The content is identical. Accepted divergence — record it at the doc-reconcile. |
| **Fit-scored suggestions (canvas add-drawer V2) stay stripped** | Net-new ranking feature; PR-A's strip-list. |
| **The add drawer offers recipes only** — no loose ingredients, no custom entry | `meal_plan_week_slots.recipe_id` is `NOT NULL`. The Diario's `AddToDaySheet` has the 3-way tabs because `meal_log` allows them; the planner cannot. |
| **The recipe peek is read-only** and links out to `/recipes/:id` | No read-only recipe page exists (that route is the editor). The peek is the read view; the Recetas wave (5) may later route through it. |

## File structure

| File | Responsibility |
|---|---|
| `src/components/ui/ResponsiveDialog.tsx` *(new)* | Drawer below `md` / Dialog at `md+`. Two desktop variants: `panel` (right-docked, full height) and `centered`. Caller owns padding, scroll and the visible header. |
| `src/features/diario/components/AddToDaySheet.tsx` *(modify)* | Consume `ResponsiveDialog` (variant `panel`); delete its own branch. Behaviour unchanged. |
| `src/features/training/components/ExerciseInfoButton.tsx` *(modify)* | Consume `ResponsiveDialog` (variant `centered`); delete its own branch. Behaviour unchanged. |
| `src/features/planning/addRecipe.ts` *(new)* | Pure: project a day's macros with a candidate recipe × servings (`projectDay`). |
| `src/features/planning/components/AddRecipeDrawer.tsx` *(new)* | The add/edit surface: destino chip, search + filter chips, recipe list, servings stepper, live day-balance footer (`MacroProjBar` ×3 + kcal bar). Replaces `RecipePickerDialog` in the planner. |
| `src/features/planning/components/CopyMealPanel.tsx` *(new)* | Copy content: source recap, 7-day multiselect grid, Reemplazar/Añadir junto segmented toggle, dynamic summary line. Pure/prop-driven. |
| `src/features/planning/components/CopyMealDialog.tsx` *(rewrite)* | Thin shell: `ResponsiveDialog` (variant `centered`) hosting `CopyMealPanel`. Same page-level props plus `mode`. |
| `src/features/planning/appendMeal.ts` *(new)* | Pure: given the week's slots, a source (date, mealIndex) and target dates, produce the exact rows to insert (append semantics, `display_order` continuing per target day). |
| `src/features/planner/api.ts` *(modify)* | `appendWeekMeal(rows)` — one `.insert([...])`. No new `.select()`. |
| `src/features/planner/hooks.ts` *(modify)* | `useAppendWeekMeal()` — mirrors `useCopyWeekMeal` (invalidate `['planner']`, toast). |
| `src/features/planning/components/RecipePeek.tsx` *(new)* | Read-only recipe panel fed by `useRecipe`: meta chips, per-serving macros, ingredient list, instructions, "Abrir receta" → `/recipes/:id`. |
| `src/features/planning/components/PlannerMealCell.tsx` *(modify)* | Drop its `RecipePickerDialog`; raise `onAddRequest` / `onOpenEntry` to the page instead (one drawer mount, not 28). |
| `src/features/planning/components/WeekGrid.tsx` *(modify)* | Pass the two new callbacks through. |
| `src/pages/PlanificadorPage.tsx` *(modify)* | Own the three surfaces: one `AddRecipeDrawer`, one `CopyMealDialog`, one `RecipePeek`. Delete the interim `RecipePickerDialog` mount. |
| `src/i18n/{es,en}/planning.json` *(modify)* | New keys per task. |

`RecipePickerDialog.tsx`, `SlotCell.tsx`, `TemplateGrid.tsx`, `DaySummary.tsx`
stay — the **template editor** still uses them. Wave 4 restyles that surface.

---

## Task 1: ResponsiveDialog + migrate both existing callers

**Files:**
- Create: `src/components/ui/ResponsiveDialog.tsx`, `src/components/ui/ResponsiveDialog.test.tsx`
- Modify: `src/features/diario/components/AddToDaySheet.tsx`, `src/features/training/components/ExerciseInfoButton.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogTitle` (`@/components/ui/dialog`), `Drawer`/`DrawerContent`/`DrawerTitle` (`@/components/ui/drawer`), `useMediaQuery` (`@/hooks/use-media-query`).
- Produces:
  ```ts
  export type ResponsiveDialogVariant = 'panel' | 'centered';
  interface ResponsiveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Accessible name. Rendered sr-only — the visible header, if any, is the caller's. */
    title: string;
    variant?: ResponsiveDialogVariant; // default 'centered'
    /** Extra classes for the content shell (desktop and mobile alike). */
    className?: string;
    /** True on mobile: vaul renders no close affordance, so the caller must draw one. */
    children: ReactNode | ((ctx: { isMobile: boolean }) => ReactNode);
  }
  ```

**Why the render-prop child:** the two existing callers differ in exactly one
way — `AddToDaySheet` hand-rolls a close button on mobile only (vaul's
`DrawerContent` draws none, radix's `DialogContent` draws its own X).
Passing `{ isMobile }` to the child keeps that asymmetry in the caller instead
of inventing a `showClose` prop that only one caller uses. A plain `ReactNode`
child is also accepted, for callers that don't care.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/ResponsiveDialog.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponsiveDialog } from './ResponsiveDialog';

// useMediaQuery reads window.matchMedia; drive it per-test.
function setViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isDesktop,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ResponsiveDialog', () => {
  it('exposes its accessible name on desktop', () => {
    setViewport(true);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="Añadir receta">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Añadir receta' })).toBeInTheDocument();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('exposes its accessible name on mobile', () => {
    setViewport(false);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="Añadir receta">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Añadir receta' })).toBeInTheDocument();
  });

  it('tells its children which breakpoint they are on', () => {
    setViewport(false);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="t">
        {({ isMobile }) => <span>{isMobile ? 'mobile' : 'desktop'}</span>}
      </ResponsiveDialog>,
    );
    expect(screen.getByText('mobile')).toBeInTheDocument();
  });

  it('docks the panel variant to the right edge on desktop', () => {
    setViewport(true);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="t" variant="panel">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    // The panel variant overrides radix's centring to pin the sheet right.
    expect(screen.getByRole('dialog').className).toContain('right-0');
  });

  it('renders nothing when closed', () => {
    setViewport(true);
    render(
      <ResponsiveDialog open={false} onOpenChange={() => {}} title="t">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/ui/ResponsiveDialog.test.tsx`
Expected: FAIL — "Failed to resolve import ./ResponsiveDialog".

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/ResponsiveDialog.tsx
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

export type ResponsiveDialogVariant = 'panel' | 'centered';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name. Rendered sr-only — a visible header, if wanted, is the caller's. */
  title: string;
  /**
   * `panel` docks a full-height sheet to the right edge on desktop (the add
   * drawer, the recipe peek); `centered` is a normal modal (the copy dialog,
   * the exercise info). Mobile is a bottom sheet either way.
   */
  variant?: ResponsiveDialogVariant;
  className?: string;
  /**
   * Called with the breakpoint, because vaul's DrawerContent draws NO close
   * affordance while radix's DialogContent draws its own X — callers that want
   * a close button need to know which side they are on.
   */
  children: ReactNode | ((ctx: { isMobile: boolean }) => ReactNode);
}

const DESKTOP_SHELL: Record<ResponsiveDialogVariant, string> = {
  panel:
    'inset-y-0 left-auto right-0 flex h-full max-h-full w-full max-w-md translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-l p-0 sm:rounded-none',
  centered: 'max-w-lg',
};

/**
 * One shell for every drawer-on-mobile / dialog-on-desktop surface. Extracted
 * from AddToDaySheet + ExerciseInfoButton, which had hand-rolled the same
 * branch. The caller owns padding, scrolling and any visible header — this only
 * owns the shell and the accessible name.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  variant = 'centered',
  className,
  children,
}: Props) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const body = typeof children === 'function' ? children({ isMobile: !isDesktop }) : children;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(DESKTOP_SHELL[variant], className)}>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn('h-[88vh] max-h-[88vh] gap-0 p-0', className)}>
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/ui/ResponsiveDialog.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Migrate `AddToDaySheet`**

Replace its `if (isDesktop) { … } return <Drawer>…` tail (the shell only) with:

```tsx
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={sheetTitle} variant="panel">
      {({ isMobile }) => (
        <>
          {renderHeader(isMobile)}
          {body}
        </>
      )}
    </ResponsiveDialog>
  );
```

Delete its now-unused `useMediaQuery` import and its `Dialog`/`Drawer` imports.
`renderHeader(showClose)` already takes the boolean — `isMobile` is exactly the
value it was being passed (`true` on the Drawer branch, `false` on the Dialog
branch). Everything else in the file (the two-step `explore`/`racion` flow, the
edit-mode effect, `racionBase`) is untouched.

- [ ] **Step 6: Migrate `ExerciseInfoButton`**

Replace its `{isDesktop ? <Dialog>… : <Drawer>…}` with:

```tsx
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t('exerciseDetail.title')}
        variant="centered"
        className="max-h-[85vh] overflow-y-auto p-4 md:p-6"
      >
        {body}
      </ResponsiveDialog>
```

Keep the trigger button exactly as it is (with its `stopPropagation` handlers).
Delete the now-unused `useMediaQuery`/`Dialog`/`Drawer` imports.

- [ ] **Step 7: Verify both migrations changed nothing behaviourally**

Run: `pnpm vitest run src/features/diario/ src/features/training/ src/components/ui/`
Expected: PASS — `AddToDaySheet.test.tsx` (425 lines of behaviour) and the
training tests must be green **without edits**. If a test needs changing, the
migration changed behaviour: stop and re-read the original shell.

Then: `pnpm lint && pnpm typecheck`.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/ResponsiveDialog.tsx src/components/ui/ResponsiveDialog.test.tsx src/features/diario/components/AddToDaySheet.tsx src/features/training/components/ExerciseInfoButton.tsx
git commit -m "refactor(ui): extract ResponsiveDialog and adopt it in both drawer/dialog callers"
```

---

## Task 2: `projectDay` — the pure day-balance projection

**Files:**
- Create: `src/features/planning/addRecipe.ts`, `src/features/planning/addRecipe.test.ts`

**Interfaces:**
- Consumes: `Macros`, `ZERO_MACROS`, `add`, `scale` from `@/features/recipes/macros`.
- Produces:
  ```ts
  export interface DayProjection {
    base: Macros;      // the day without this entry
    added: Macros;     // recipe perServing × servings
    projected: Macros; // base + added
  }
  export function projectDay(opts: {
    dayTotals: Macros;
    perServing: Macros;
    servings: number;
    /** Edit mode: the entry being replaced, whose macros must come OUT of the base first. */
    replacing?: Macros;
  }): DayProjection
  ```

The `replacing` parameter is the same trap wave 2 hit in the Diario: editing an
entry must not double-count it. `AddToDaySheet` solved it with `racionBase =
totals − editing.macros`; do the same here, but inside the pure module so it is
testable.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/planning/addRecipe.test.ts
import { describe, it, expect } from 'vitest';
import { projectDay } from './addRecipe';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';

const m = (kcal: number, p: number, c: number, f: number): Macros => ({
  kcal, proteinG: p, carbsG: c, fatG: f, fiberG: 0,
});

describe('projectDay', () => {
  it('adds servings × per-serving macros to the day', () => {
    const r = projectDay({ dayTotals: m(1500, 100, 150, 40), perServing: m(400, 30, 45, 10), servings: 2 });
    expect(r.added).toEqual(m(800, 60, 90, 20));
    expect(r.projected.kcal).toBe(2300);
    expect(r.projected.proteinG).toBe(160);
    expect(r.base.kcal).toBe(1500);
  });

  it('takes the edited entry out of the base so it is not double-counted', () => {
    // The day already contains this entry at 1 serving; the user re-opens it and picks 2.
    const r = projectDay({
      dayTotals: m(1900, 130, 195, 50),
      perServing: m(400, 30, 45, 10),
      servings: 2,
      replacing: m(400, 30, 45, 10),
    });
    expect(r.base).toEqual(m(1500, 100, 150, 40));
    expect(r.projected.kcal).toBe(2300); // 1500 + 800, NOT 1900 + 800
  });

  it('handles half servings', () => {
    const r = projectDay({ dayTotals: ZERO_MACROS, perServing: m(400, 30, 45, 10), servings: 0.5 });
    expect(r.added.kcal).toBe(200);
    expect(r.added.proteinG).toBe(15);
  });

  it('treats zero servings as no contribution', () => {
    const r = projectDay({ dayTotals: m(1500, 100, 150, 40), perServing: m(400, 30, 45, 10), servings: 0 });
    expect(r.added).toEqual(ZERO_MACROS);
    expect(r.projected).toEqual(m(1500, 100, 150, 40));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/addRecipe.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/planning/addRecipe.ts
import { add, scale, ZERO_MACROS, type Macros } from '@/features/recipes/macros';

export interface DayProjection {
  /** The day WITHOUT the entry being added or edited. */
  base: Macros;
  /** What this serving contributes. */
  added: Macros;
  /** base + added — what the day becomes if the user confirms. */
  projected: Macros;
}

/**
 * Project a plan day's macros with a candidate recipe. Pure — the caller
 * supplies the day's totals and the recipe's per-serving macros, both of which
 * the planner already holds client-side (`useActiveWeek` slots carry macros,
 * `useRecipes` carries `perServing`). No fetch, no rounding: round at render.
 *
 * `replacing` is the macros of the entry being EDITED. It must come out of the
 * base, or the entry is counted twice (the same trap the Diario's ración step
 * solved with `racionBase`).
 */
export function projectDay({
  dayTotals,
  perServing,
  servings,
  replacing,
}: {
  dayTotals: Macros;
  perServing: Macros;
  servings: number;
  replacing?: Macros;
}): DayProjection {
  const base = replacing ? add(dayTotals, scale(replacing, -1)) : dayTotals;
  const added = servings > 0 ? scale(perServing, servings) : ZERO_MACROS;
  return { base, added, projected: add(base, added) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/addRecipe.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/addRecipe.ts src/features/planning/addRecipe.test.ts
git commit -m "feat(planner): pure day-balance projection for the add flow"
```

---

## Task 3: AddRecipeDrawer

**Files:**
- Create: `src/features/planning/components/AddRecipeDrawer.tsx`, `src/features/planning/components/AddRecipeDrawer.test.tsx`
- Modify: `src/i18n/es/planning.json`, `src/i18n/en/planning.json`

**Interfaces:**
- Consumes: `ResponsiveDialog` (Task 1), `projectDay` (Task 2), `useRecipes` (`@/features/recipes/hooks` — its `RecipeListItem` already carries `perServing`), `MacroProjBar` (`@/features/diario/components/MacroProjBar`, props `{ metric: 'protein'|'carbs'|'fat', base, added, target, className }`), `MacroBar`, `classify`, `roundMacro`.
- Produces:
  ```ts
  export interface AddRecipeTarget {
    date: string;           // ISO
    mealIndex: number;
    mealTime: string | null;
    /** The day's current totals, for the balance footer. */
    dayTotals: Macros;
  }
  export interface AddRecipeEditing {
    id: string;
    recipe_id: string;
    recipe_name: string;
    servings: number;
    macros: Macros;         // this entry's contribution, to subtract from the base
  }
  AddRecipeDrawer({
    open, onOpenChange, target, editing, targets, phaseType, busy,
    onAdd, onUpdate, onRemove,
  })
  ```
  with `onAdd(recipeId, recipeName, servings)`, `onUpdate(entryId, recipeId, recipeName, servings)`, `onRemove(entryId)`, `targets?: Macros` (the daily macro target), `phaseType?: PhaseType`.

**Shape (canvas `AñadirRecetaDrawerV1`):** header = title + a "destino" chip
(`<weekday> <d> · <meal name> · <hh:mm>`); body = search input, filter chips
(Todas / Favoritas is stripped — recipes have no favourite flag; use the meal-type
chips the recipe list already carries: `meal_types`), the recipe list (name +
kcal + P·C·G triad per serving), and a servings stepper (½ steps, like the
Diario's ración step) once a recipe is picked; footer = the live balance: a kcal
bar (consumed + this recipe vs target, striped overflow) and three
`MacroProjBar`s, then the primary CTA. In edit mode the drawer opens with the
recipe pre-picked and shows a Delete action.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/AddRecipeDrawer.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddRecipeDrawer } from './AddRecipeDrawer';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';

const perServing: Macros = { kcal: 400, proteinG: 30, carbsG: 45, fatG: 10, fiberG: 4 };

vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({
    data: [
      { id: 'r1', name: 'Lentejas estofadas', servings: 4, description: null, updated_at: '', ingredient_count: 5, meal_types: ['lunch'], labels: {}, perServing },
      { id: 'r2', name: 'Tortilla francesa', servings: 1, description: null, updated_at: '', ingredient_count: 2, meal_types: ['dinner'], labels: {}, perServing: { ...perServing, kcal: 188 } },
    ],
    isLoading: false,
  }),
}));

// jsdom has no matchMedia; ResponsiveDialog needs one. Desktop branch.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

const targetDay = {
  date: '2026-05-28',
  mealIndex: 1,
  mealTime: '14:00',
  dayTotals: { kcal: 1500, proteinG: 100, carbsG: 150, fatG: 40, fiberG: 20 } as Macros,
};

const macroTargets: Macros = { kcal: 2200, proteinG: 160, carbsG: 250, fatG: 70, fiberG: 30 };

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('AddRecipeDrawer', () => {
  it('names its destination slot', () => {
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    // Meal 1 = "Comida", at 14:00.
    expect(screen.getByText(/Comida/)).toBeInTheDocument();
    expect(screen.getByText(/14:00/)).toBeInTheDocument();
  });

  it('filters the recipe list by the search box', async () => {
    const user = userEvent.setup();
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(screen.getByText('Tortilla francesa')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'lentej');
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.queryByText('Tortilla francesa')).toBeNull();
  });

  it('projects the day balance once a recipe is picked, and follows the servings stepper', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    await user.click(screen.getByText('Lentejas estofadas'));

    // 1 serving: 1500 + 400 = 1900 projected kcal.
    expect(screen.getByTestId('projected-kcal')).toHaveTextContent('1900');
    // Protein proj bar: base 100, added 30.
    const p = container.querySelector('[data-metric="protein"]');
    expect(p).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /más|increase|\+/i }));
    // 2 servings: 1500 + 800 = 2300.
    expect(screen.getByTestId('projected-kcal')).toHaveTextContent('2300');
  });

  it('adds the picked recipe with its servings', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={onAdd} onUpdate={noop} onRemove={noop} />,
    );
    await user.click(screen.getByText('Lentejas estofadas'));
    await user.click(screen.getByRole('button', { name: /añadir a/i }));
    expect(onAdd).toHaveBeenCalledWith('r1', 'Lentejas estofadas', 1);
  });

  it('opens pre-filled in edit mode and does not double-count the edited entry', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <AddRecipeDrawer
        open
        onOpenChange={noop}
        // The day's 1900 kcal ALREADY include this entry's 400.
        target={{ ...targetDay, dayTotals: { kcal: 1900, proteinG: 130, carbsG: 195, fatG: 50, fiberG: 24 } }}
        editing={{ id: 'e1', recipe_id: 'r1', recipe_name: 'Lentejas estofadas', servings: 1, macros: perServing }}
        targets={macroTargets}
        onAdd={noop}
        onUpdate={onUpdate}
        onRemove={noop}
      />,
    );
    // Base is 1900 − 400 = 1500, so the projection at 1 serving is 1900 again (not 2300).
    expect(screen.getByTestId('projected-kcal')).toHaveTextContent('1900');
    await user.click(screen.getByRole('button', { name: /guardar|añadir a/i }));
    expect(onUpdate).toHaveBeenCalledWith('e1', 'r1', 'Lentejas estofadas', 1);
  });

  it('offers delete only in edit mode', () => {
    const { rerender } = render(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(screen.queryByRole('button', { name: /quitar|eliminar/i })).toBeNull();

    rerender(
      <AddRecipeDrawer open onOpenChange={noop} target={targetDay} targets={macroTargets}
        editing={{ id: 'e1', recipe_id: 'r1', recipe_name: 'Lentejas estofadas', servings: 1, macros: perServing }}
        onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(screen.getByRole('button', { name: /quitar|eliminar/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/components/AddRecipeDrawer.test.tsx`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Add the i18n keys**

`src/i18n/es/planning.json`, new top-level `addRecipe` object:

```json
"addRecipe": {
  "title": "Añadir receta",
  "editTitle": "Editar receta",
  "destination": "{{day}} · {{meal}} · {{time}}",
  "destinationNoTime": "{{day}} · {{meal}}",
  "search": "Buscar receta…",
  "searchLabel": "Buscar receta",
  "noResults": "Ninguna receta coincide.",
  "empty": "Aún no tienes recetas. Crea la primera para poder planificar.",
  "servings": "Raciones",
  "less": "Menos raciones",
  "more": "Más raciones",
  "perServing": "por ración",
  "projected": "Proyectado",
  "remaining": "quedan {{n}}",
  "over": "+{{n}} pasado",
  "confirmAdd": "Añadir a la comida",
  "confirmSave": "Guardar",
  "remove": "Quitar del plan",
  "filterAll": "Todas"
}
```

`src/i18n/en/planning.json`, mirrored:

```json
"addRecipe": {
  "title": "Add recipe",
  "editTitle": "Edit recipe",
  "destination": "{{day}} · {{meal}} · {{time}}",
  "destinationNoTime": "{{day}} · {{meal}}",
  "search": "Search recipe…",
  "searchLabel": "Search recipe",
  "noResults": "No recipe matches.",
  "empty": "You have no recipes yet. Create one to start planning.",
  "servings": "Servings",
  "less": "Fewer servings",
  "more": "More servings",
  "perServing": "per serving",
  "projected": "Projected",
  "remaining": "{{n}} left",
  "over": "+{{n}} over",
  "confirmAdd": "Add to meal",
  "confirmSave": "Save",
  "remove": "Remove from plan",
  "filterAll": "All"
}
```

- [ ] **Step 4: Write the implementation**

Build `AddRecipeDrawer` to this shape. It owns: `query` (search text),
`picked` (`RecipeListItem | null`, pre-filled from `editing`), and `servings`
(default `editing?.servings ?? 1`, ½ steps, floor 0.5).

- Shell: `<ResponsiveDialog open onOpenChange title={editing ? t('addRecipe.editTitle') : t('addRecipe.title')} variant="panel">`, render-prop child so mobile can draw its own close button (mirror `AddToDaySheet`'s header).
- Header: visible `<h2>` + the destino chip built from `mealLabelKey(target.mealIndex)` (already in `@/features/planning/weekSummary`), the weekday (`formatDate(parseISO(target.date), 'EEE d', locale)`) and `target.mealTime?.slice(0, 5)`; use `addRecipe.destinationNoTime` when the slot has no time.
- List: `useRecipes()` filtered by a case-insensitive, accent-insensitive match on `name` (reuse whatever normaliser the repo already has if one exists; otherwise `.toLocaleLowerCase()` is acceptable — say so in the report). Each row: name, `roundMacro(perServing.kcal)` kcal, and a P·C·G triad in `text-macro-p/-c/-g` (same markup as `TodayPlanList`'s triad). Picking a row sets `picked`.
- Servings stepper: `−` / value / `+` buttons in ½ steps, both with `aria-label`s (`addRecipe.less` / `addRecipe.more`), value in `tnum`.
- Footer (only when `picked`): compute
  `const { base, added, projected } = projectDay({ dayTotals: target.dayTotals, perServing: picked.perServing, servings, replacing: editing?.macros })`.
  Render a kcal line — `<span data-testid="projected-kcal">{roundMacro(projected.kcal)}</span>` over `targets.kcal`, toned via `classify('kcal', projected.kcal, targets?.kcal, phaseType)` and a `MacroBar` — then three `MacroProjBar`s (`protein`/`carbs`/`fat`) fed `base={base.X}` `added={added.X}` `target={targets.X}`, then the CTA (`onAdd`/`onUpdate`) and, in edit mode, the destructive `onRemove`.
- Guard `targets == null`: skip the bars, keep the projected kcal readout, keep the CTA working.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/components/AddRecipeDrawer.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/planning/components/AddRecipeDrawer.tsx src/features/planning/components/AddRecipeDrawer.test.tsx src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "feat(planner): add-recipe drawer with a live day-balance footer"
```

---

## Task 4: Append rows — the pure projection + the data layer

**Files:**
- Create: `src/features/planning/appendMeal.ts`, `src/features/planning/appendMeal.test.ts`
- Modify: `src/features/planner/api.ts`, `src/features/planner/hooks.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AppendRow {
    plan_week_id: string;
    date: string;
    meal_index: number;
    meal_time: string | null;
    recipe_id: string;
    servings: number;
    display_order: number;
  }
  export function appendMealRows(opts: {
    planWeekId: string;
    slots: { date: string; meal_index: number; meal_time: string | null; recipe_id: string; servings: number; display_order: number }[];
    sourceDate: string;
    mealIndex: number;
    targetDates: string[];
  }): AppendRow[]
  ```
  and in `planner/api.ts`: `appendWeekMeal(rows: AppendRow[]): Promise<void>`;
  in `planner/hooks.ts`: `useAppendWeekMeal()`.

**Semantics (the whole point of this task):** the existing `copy_week_meal` RPC
is delete-then-insert — it wipes the whole `meal_index` bucket on every target
date and re-inserts the source rows with their `display_order` copied verbatim.
**Append must not delete anything.** It inserts copies of the source rows onto
each target date, with `display_order` continuing after whatever already sits in
that (date, meal_index) bucket — so `max(existing display_order) + 1, +2, …`,
preserving the source's relative order. One `.insert([...])` of all rows for all
target dates: a single statement, therefore atomic, therefore no RPC needed
(hard invariant 3 governs mutations spanning **more than one table**).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/planning/appendMeal.test.ts
import { describe, it, expect } from 'vitest';
import { appendMealRows } from './appendMeal';

const slot = (over: Partial<Parameters<typeof appendMealRows>[0]['slots'][number]>) => ({
  date: '2026-05-25', meal_index: 1, meal_time: '14:00',
  recipe_id: 'r1', servings: 1, display_order: 0, ...over,
});

describe('appendMealRows', () => {
  it('copies every entry of the source meal onto each target date', () => {
    const rows = appendMealRows({
      planWeekId: 'w1',
      slots: [
        slot({ date: '2026-05-25', recipe_id: 'r1', display_order: 0 }),
        slot({ date: '2026-05-25', recipe_id: 'r2', display_order: 1, servings: 2 }),
      ],
      sourceDate: '2026-05-25',
      mealIndex: 1,
      targetDates: ['2026-05-26', '2026-05-27'],
    });
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.date === '2026-05-26')).toHaveLength(2);
    expect(rows.every((r) => r.plan_week_id === 'w1' && r.meal_index === 1)).toBe(true);
    // servings and meal_time ride along
    expect(rows.find((r) => r.date === '2026-05-26' && r.recipe_id === 'r2')?.servings).toBe(2);
    expect(rows[0].meal_time).toBe('14:00');
  });

  it('continues display_order after what the target day already holds', () => {
    const rows = appendMealRows({
      planWeekId: 'w1',
      slots: [
        slot({ date: '2026-05-25', recipe_id: 'r1', display_order: 0 }),
        slot({ date: '2026-05-25', recipe_id: 'r2', display_order: 1 }),
        // Tuesday's lunch already has two entries.
        slot({ date: '2026-05-26', recipe_id: 'rX', display_order: 0 }),
        slot({ date: '2026-05-26', recipe_id: 'rY', display_order: 1 }),
      ],
      sourceDate: '2026-05-25',
      mealIndex: 1,
      targetDates: ['2026-05-26'],
    });
    expect(rows.map((r) => r.display_order)).toEqual([2, 3]);
    // …and the source's relative order is preserved.
    expect(rows.map((r) => r.recipe_id)).toEqual(['r1', 'r2']);
  });

  it('starts at 0 on an empty target slot', () => {
    const rows = appendMealRows({
      planWeekId: 'w1',
      slots: [slot({ date: '2026-05-25', recipe_id: 'r1', display_order: 0 })],
      sourceDate: '2026-05-25',
      mealIndex: 1,
      targetDates: ['2026-05-27'],
    });
    expect(rows[0].display_order).toBe(0);
  });

  it('ignores other meals and other days when counting the target bucket', () => {
    const rows = appendMealRows({
      planWeekId: 'w1',
      slots: [
        slot({ date: '2026-05-25', meal_index: 1, recipe_id: 'r1', display_order: 0 }),
        // Same target day, DIFFERENT meal — must not shift the append offset.
        slot({ date: '2026-05-26', meal_index: 0, recipe_id: 'rZ', display_order: 4 }),
      ],
      sourceDate: '2026-05-25',
      mealIndex: 1,
      targetDates: ['2026-05-26'],
    });
    expect(rows[0].display_order).toBe(0);
  });

  it('returns nothing when the source meal is empty', () => {
    expect(
      appendMealRows({ planWeekId: 'w1', slots: [], sourceDate: '2026-05-25', mealIndex: 1, targetDates: ['2026-05-26'] }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/appendMeal.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the pure module**

```ts
// src/features/planning/appendMeal.ts

/** A row to insert into `meal_plan_week_slots`. */
export interface AppendRow {
  plan_week_id: string;
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  servings: number;
  display_order: number;
}

interface SlotLike {
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  servings: number;
  display_order: number;
}

/**
 * The rows an "añadir junto" (append) copy must insert: every entry of the
 * source meal, re-dated onto each target, with `display_order` continuing after
 * whatever that target day's same meal already holds — so nothing is
 * overwritten and the source's relative order survives.
 *
 * The counterpart of the `copy_week_meal` RPC, which REPLACES (it deletes the
 * whole meal_index bucket on each target first). Append needs no RPC: all rows
 * go into one table in one `insert()` statement.
 */
export function appendMealRows({
  planWeekId,
  slots,
  sourceDate,
  mealIndex,
  targetDates,
}: {
  planWeekId: string;
  slots: SlotLike[];
  sourceDate: string;
  mealIndex: number;
  targetDates: string[];
}): AppendRow[] {
  const source = slots
    .filter((s) => s.date === sourceDate && s.meal_index === mealIndex)
    .sort((a, b) => a.display_order - b.display_order);
  if (source.length === 0) return [];

  return targetDates.flatMap((date) => {
    const occupied = slots.filter((s) => s.date === date && s.meal_index === mealIndex);
    const nextOrder = occupied.length
      ? Math.max(...occupied.map((s) => s.display_order)) + 1
      : 0;
    return source.map((s, i) => ({
      plan_week_id: planWeekId,
      date,
      meal_index: mealIndex,
      meal_time: s.meal_time,
      recipe_id: s.recipe_id,
      servings: s.servings,
      display_order: nextOrder + i,
    }));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/appendMeal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the data layer**

In `src/features/planner/api.ts`, next to `copyWeekMeal`:

```ts
/**
 * Append (rather than replace) a meal onto other days: a single-table,
 * single-statement multi-row insert — atomic, so no RPC is needed (hard
 * invariant 3 governs mutations spanning more than one table). Replace still
 * goes through the `copy_week_meal` RPC, which deletes before it inserts.
 */
export async function appendWeekMeal(rows: AppendRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('meal_plan_week_slots').insert(rows);
  if (error) throw error;
}
```

(import `AppendRow` from `@/features/planning/appendMeal`.)

In `src/features/planner/hooks.ts`, mirroring `useCopyWeekMeal`:

```ts
export function useAppendWeekMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: appendWeekMeal,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
      toastSaved();
    },
    onError: toastError,
  });
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm vitest run src/features/planning/ src/features/planner/ && pnpm lint && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/planning/appendMeal.ts src/features/planning/appendMeal.test.ts src/features/planner/api.ts src/features/planner/hooks.ts
git commit -m "feat(planner): append mode for copying a meal to other days"
```

---

## Task 5: CopyMealPanel + the restyled CopyMealDialog

**Files:**
- Create: `src/features/planning/components/CopyMealPanel.tsx`, `src/features/planning/components/CopyMealPanel.test.tsx`
- Rewrite: `src/features/planning/components/CopyMealDialog.tsx`, `src/features/planning/components/CopyMealDialog.test.tsx`
- Modify: `src/i18n/{es,en}/planning.json`

**Interfaces:**
- Produces:
  ```ts
  export type CopyMode = 'replace' | 'append';
  // CopyTarget keeps its current shape: { key, label, sublabel?, willOverwrite }
  CopyMealPanel({ sourceLabel, entryNames, targets, mode, onModeChange, selected, onToggle, busy, onConfirm })
  CopyMealDialog({ open, onOpenChange, sourceLabel, entryNames, targets, busy, onConfirm })
  // onConfirm(selectedKeys: string[], mode: CopyMode)
  ```

**Changes from today's dialog:** the flat checkbox list becomes the canvas's
7-day grid of toggle cells; a segmented **Reemplazar / Añadir junto** control
picks the mode; the summary line reads "Copiar a N días, reemplazando" or
"…añadiendo junto a lo que ya haya"; the `willOverwrite` badge only shows in
`replace` mode (in `append` nothing is overwritten — that is the entire point).
`entryCount: number` becomes `entryNames: string[]` so the panel can recap what
is being copied (the canvas lists the source recipes).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/planning/components/CopyMealPanel.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyMealPanel } from './CopyMealPanel';

const targets = [
  { key: '2026-05-26', label: 'Martes', sublabel: '26 may', willOverwrite: true },
  { key: '2026-05-27', label: 'Miércoles', sublabel: '27 may', willOverwrite: false },
];

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

function setup(over: Partial<Parameters<typeof CopyMealPanel>[0]> = {}) {
  const props = {
    sourceLabel: '14:00 · Lunes',
    entryNames: ['Lentejas estofadas', 'Pan integral'],
    targets,
    mode: 'replace' as const,
    onModeChange: noop,
    selected: new Set<string>(),
    onToggle: noop,
    onConfirm: noop,
    ...over,
  };
  return { props, ...render(<CopyMealPanel {...props} />) };
}

describe('CopyMealPanel', () => {
  it('recaps the source meal and its recipes', () => {
    setup();
    expect(screen.getByText('14:00 · Lunes')).toBeInTheDocument();
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
  });

  it('warns about overwriting only in replace mode', () => {
    const { unmount } = setup({ mode: 'replace' });
    expect(screen.getByText(/se sobrescribirá/i)).toBeInTheDocument();
    unmount();

    setup({ mode: 'append' });
    // Append never overwrites — the badge must be gone.
    expect(screen.queryByText(/se sobrescribirá/i)).toBeNull();
  });

  it('switches mode through the segmented control', async () => {
    const onModeChange = vi.fn();
    setup({ onModeChange });
    await userEvent.click(screen.getByRole('button', { name: /añadir junto/i }));
    expect(onModeChange).toHaveBeenCalledWith('append');
  });

  it('toggles a day', async () => {
    const onToggle = vi.fn();
    setup({ onToggle });
    await userEvent.click(screen.getByRole('checkbox', { name: /Martes/ }));
    expect(onToggle).toHaveBeenCalledWith('2026-05-26');
  });

  it('disables the CTA until at least one day is picked, and confirms with the mode', async () => {
    const onConfirm = vi.fn();
    const { unmount } = setup({ onConfirm });
    expect(screen.getByRole('button', { name: /^copiar/i })).toBeDisabled();
    unmount();

    setup({ onConfirm, selected: new Set(['2026-05-27']), mode: 'append' });
    await userEvent.click(screen.getByRole('button', { name: /^copiar/i }));
    expect(onConfirm).toHaveBeenCalledWith(['2026-05-27'], 'append');
  });
});
```

Rewrite `CopyMealDialog.test.tsx` to cover the shell only: that it renders the
panel inside a dialog, that it resets its selection when reopened, and that it
hands `(keys, mode)` to `onConfirm`. Keep using the `window.matchMedia` stub
shown in Task 3.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/features/planning/components/CopyMealPanel.test.tsx src/features/planning/components/CopyMealDialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the i18n keys**

Extend the existing `copyMeal` object (ES):

```json
"modeReplace": "Reemplazar",
"modeAppend": "Añadir junto",
"sourceRecipes": "Se copiarán:",
"summaryReplace": "Copiar a {{count}} días, reemplazando lo que haya.",
"summaryAppend": "Copiar a {{count}} días, junto a lo que ya haya.",
"pickDays": "Elige al menos un día."
```

EN:

```json
"modeReplace": "Replace",
"modeAppend": "Add alongside",
"sourceRecipes": "Copying:",
"summaryReplace": "Copy to {{count}} days, replacing what's there.",
"summaryAppend": "Copy to {{count}} days, alongside what's there.",
"pickDays": "Pick at least one day."
```

- [ ] **Step 4: Write the panel and the shell**

`CopyMealPanel` — pure, no state of its own (the dialog owns `mode` and
`selected`): source recap (label + the recipe names), a 7-cell day grid where
each cell is `role="checkbox"` with `aria-checked` (accent-soft + check icon
when on; the `willOverwrite` badge only when `mode === 'replace'`), a segmented
2-button mode control (`aria-pressed`), the summary line
(`copyMeal.summaryReplace` / `copyMeal.summaryAppend` with `count`), and the
primary CTA (disabled while `selected.size === 0`).

`CopyMealDialog` — the shell: `ResponsiveDialog variant="centered"`, owns
`mode` (default `'replace'`) and `selected` (a `Set`, reset on open, exactly as
the current dialog does with its `useEffect`), renders `CopyMealPanel`, and
calls `onConfirm(keys, mode)` then closes.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/features/planning/components/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/planning/components/CopyMealPanel.tsx src/features/planning/components/CopyMealPanel.test.tsx src/features/planning/components/CopyMealDialog.tsx src/features/planning/components/CopyMealDialog.test.tsx src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "feat(planner): copy-meal panel with replace/append modes"
```

---

## Task 6: RecipePeek

**Files:**
- Create: `src/features/planning/components/RecipePeek.tsx`, `src/features/planning/components/RecipePeek.test.tsx`
- Modify: `src/i18n/{es,en}/planning.json`

**Interfaces:**
- Consumes: `useRecipe(recipeId)` from `@/features/recipes/hooks` — returns `RecipeWithIngredients` (`recipes` row + `recipe_ingredients[]` with `quantity`, `per_serving` and the joined `ingredient`), which carries `instructions`. **Reuse it as-is: no new `.select()`.** Also `computeRecipeMacros` (`@/features/recipes/macros`), `ResponsiveDialog` (variant `panel`), `Skeleton`.
- Produces: `RecipePeek({ open, onOpenChange, recipeId, contextLabel, servings })` — `contextLabel` is the plan context (e.g. "Comida · Jue 30 · del plan"), `servings` the planned servings.

Shape (canvas option 3): header (recipe name + context), meta chips (servings,
ingredient count), a per-serving macros card (kcal hero + P·C·G pastilles), the
ingredient list (quantity + unit + name), the `instructions` text, and a footer
with "Abrir receta" linking to `/recipes/:id`. Loading → `Skeleton`s. A recipe
with no instructions simply omits that block.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/RecipePeek.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecipePeek } from './RecipePeek';

const recipe = {
  id: 'r1',
  name: 'Lentejas estofadas',
  servings: 4,
  instructions: 'Sofríe la verdura. Añade las lentejas. Cuece 30 min.',
  recipe_ingredients: [
    {
      id: 'ri1', recipe_id: 'r1', ingredient_id: 'i1', quantity: 400, per_serving: false,
      display_order: 0, created_at: '',
      ingredient: {
        id: 'i1', name: 'Lentejas', brand: null, unit_type: 'g',
        kcal_per_unit: 1.16, protein_g_per_unit: 0.09, carbs_g_per_unit: 0.2,
        fat_g_per_unit: 0.01, fiber_g_per_unit: 0.08,
      },
    },
  ],
};

let recipeQuery: { data: unknown; isLoading: boolean } = { data: recipe, isLoading: false };

vi.mock('@/features/recipes/hooks', () => ({
  useRecipe: () => recipeQuery,
}));

beforeEach(() => {
  recipeQuery = { data: recipe, isLoading: false };
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

function renderPeek() {
  return render(
    <MemoryRouter>
      <RecipePeek open onOpenChange={() => {}} recipeId="r1" contextLabel="Comida · Jue 30" servings={2} />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('RecipePeek', () => {
  it('shows the recipe, its plan context and its ingredients', () => {
    renderPeek();
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.getByText('Comida · Jue 30')).toBeInTheDocument();
    expect(screen.getByText(/Lentejas/)).toBeInTheDocument();
    expect(screen.getByText(/400/)).toBeInTheDocument();
  });

  it('shows the instructions when the recipe has them', () => {
    renderPeek();
    expect(screen.getByText(/Sofríe la verdura/)).toBeInTheDocument();
  });

  it('omits the instructions block when the recipe has none', () => {
    recipeQuery = { data: { ...recipe, instructions: null }, isLoading: false };
    renderPeek();
    expect(screen.queryByText(/Sofríe la verdura/)).toBeNull();
  });

  it('links out to the full recipe', () => {
    renderPeek();
    expect(screen.getByRole('link', { name: /abrir receta/i })).toHaveAttribute('href', '/recipes/r1');
  });

  it('shows a loading state while the recipe is in flight', () => {
    recipeQuery = { data: undefined, isLoading: true };
    const { container } = renderPeek();
    expect(container.querySelector('[data-slot="skeleton"], .animate-pulse')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/components/RecipePeek.test.tsx`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Add the i18n keys**

ES, new top-level `peek` object:

```json
"peek": {
  "title": "Receta del plan",
  "servings": "{{count}} raciones",
  "ingredients": "Ingredientes",
  "instructions": "Elaboración",
  "perServing": "Por ración",
  "planned": "Planificado: {{count}} ración(es)",
  "open": "Abrir receta",
  "missing": "No se pudo cargar la receta."
}
```

EN:

```json
"peek": {
  "title": "Recipe in the plan",
  "servings": "{{count}} servings",
  "ingredients": "Ingredients",
  "instructions": "Method",
  "perServing": "Per serving",
  "planned": "Planned: {{count}} serving(s)",
  "open": "Open recipe",
  "missing": "The recipe could not be loaded."
}
```

- [ ] **Step 4: Write the implementation**

Per-serving macros come from `computeRecipeMacros({ servings: recipe.servings, rows: recipe.recipe_ingredients.map(ri => ({ ingredient: ri.ingredient, quantity: Number(ri.quantity), perServing: ri.per_serving })) }).perServing` — the same call `AddToDaySheet.editSelection` makes. Ingredient quantities render as `quantity` + `ingredient.unit_type` + `ingredientDisplayName(ingredient)` (that helper is in `@/features/ingredients/api`). The footer's "Abrir receta" is a `<Link to={`/recipes/${recipeId}`}>`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/components/RecipePeek.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/planning/components/RecipePeek.tsx src/features/planning/components/RecipePeek.test.tsx src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "feat(planner): read-only recipe peek from a plan cell"
```

---

## Task 7: Wire the three surfaces into the page

**Files:**
- Modify: `src/features/planning/components/PlannerMealCell.tsx`, `src/features/planning/components/PlannerMealCell.test.tsx`
- Modify: `src/features/planning/components/WeekGrid.tsx`, `src/features/planning/components/WeekGrid.test.tsx`
- Modify: `src/pages/PlanificadorPage.tsx`, `src/pages/PlanificadorPage.test.tsx`

**Interfaces:**
- `PlannerMealCell` **loses** its `RecipePickerDialog`, its `onAdd`/`onUpdate`/`onRemove` props and its internal `pickerOpen`/`editing` state. It **gains**:
  ```ts
  onAddRequest: () => void;                       // "añadir" / "añadir comida"
  onOpenEntry: (entry: PlannerCellEntry) => void; // clicking a recipe bullet
  ```
- `WeekGrid` passes both through, keyed by `(date, row)`:
  ```ts
  onAddRequest: (date: string, mealIndex: number, mealTime: string | null) => void;
  onOpenEntry: (entry: PlannerCellEntry, date: string, mealIndex: number, mealTime: string | null) => void;
  ```
  (it drops `onAdd`/`onUpdate`/`onRemove`).
- `PlanificadorPage` mounts exactly **one** `AddRecipeDrawer`, **one**
  `CopyMealDialog` and **one** `RecipePeek`, and deletes the interim
  `RecipePickerDialog` mount and its `mobilePick` state.

**Why:** today the grid mounts 28 `RecipePickerDialog`s (one per cell, each with
its own `useForm` + zodResolver). Hoisting to one drawer is both the canvas's
model and a real cost saving.

- [ ] **Step 1: Update the page test first (it is the contract)**

Add to `src/pages/PlanificadorPage.test.tsx` (keeping every existing test —
they still describe the view):

- clicking a grid cell's "añadir comida" opens the add drawer with that cell's
  destination (assert the destino chip names the right meal/time);
- clicking a planned recipe (mobile list AND a grid bullet) opens the **peek**,
  not the editor;
- the add drawer's confirm calls the ADD mutation for a fresh slot and the
  UPDATE mutation when it was opened on an existing entry (distinct `vi.fn()`
  spies, as the existing "updates the existing entry (not add)" test does);
- copying with mode `append` calls `useAppendWeekMeal`'s mutate and NOT
  `useCopyWeekMeal`'s; with mode `replace`, the reverse.

Mock `@/features/planner/hooks` as the file already does, adding
`useAppendWeekMeal`.

- [ ] **Step 2: Run the page test to verify it fails**

Run: `pnpm vitest run src/pages/PlanificadorPage.test.tsx`
Expected: FAIL — the drawer/peek don't exist on the page yet.

- [ ] **Step 3: Strip the picker out of the cell, raise the callbacks**

`PlannerMealCell`: delete the `RecipePickerDialog` import, the `useState`s and
the dialog JSX. The empty-state button and the inline "añadir" call
`onAddRequest()`; each recipe bullet calls `onOpenEntry(e)`. Keep the copy
button, the footer and every class exactly as they are — **this is not a
restyle**, only a rewiring. Update `PlannerMealCell.test.tsx` accordingly (its
`useRecipes` mock and the QueryClient wrapper can go: the cell no longer touches
the data layer — a good sign the hoist is real).

- [ ] **Step 4: Thread the callbacks through WeekGrid**

Replace `onAdd`/`onUpdate`/`onRemove` with `onAddRequest`/`onOpenEntry`, both
closed over `(day.date, row.mealIndex, row.mealTime)`. Update `WeekGrid.test.tsx`'s
props. Its existing assertions about layout and labels stay untouched.

- [ ] **Step 5: Wire the page**

State: `addTarget: { target: AddRecipeTarget; editing?: AddRecipeEditing } | null`,
`peek: { recipeId: string; contextLabel: string; servings: number } | null`, and
the existing `copySource`.

- `AddRecipeTarget.dayTotals` comes from the `dayTotals` map the page already
  builds (`aggregateDayMacros`) — no new derivation.
- `onOpenEntry` (both breakpoints) opens the **peek**. Editing a planned entry
  is reached from the peek's own "Editar" action, which closes the peek and
  opens the drawer in edit mode — one flow, both breakpoints.
- The drawer's `onAdd` → `handleAdd(target.date, target.mealIndex, target.mealTime, …)`
  (already exists); `onUpdate` → `updateSlot`; `onRemove` → `deleteSlot`.
- `CopyMealDialog.onConfirm(keys, mode)`:
  ```ts
  if (mode === 'append') {
    await appendMeal.mutateAsync(
      appendMealRows({
        planWeekId: week.data.id,
        slots: week.data.slots,
        sourceDate: copySource.date,
        mealIndex: copySource.mealIndex,
        targetDates: keys,
      }),
    );
  } else {
    await copyMeal.mutateAsync({
      plan_week_id: week.data.id,
      source_date: copySource.date,
      meal_index: copySource.mealIndex,
      target_dates: keys,
    });
  }
  ```
- Delete the `mobilePick` state and the `RecipePickerDialog` mount.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/pages/ src/features/planning/ src/features/planner/ src/components/`
Expected: PASS.

- [ ] **Step 7: Full verification and commit**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`
Expected: all green.

```bash
git add src/features/planning/components/PlannerMealCell.tsx src/features/planning/components/PlannerMealCell.test.tsx src/features/planning/components/WeekGrid.tsx src/features/planning/components/WeekGrid.test.tsx src/pages/PlanificadorPage.tsx src/pages/PlanificadorPage.test.tsx
git commit -m "feat(planner): wire the add drawer, copy modes and recipe peek into the page"
```

---

## PR wrap-up (in this order — do NOT reorder)

- [ ] `pnpm lint && pnpm build && pnpm test` green from the worktree root, run
      by the controller, not trusted from a subagent's report. `git status` clean.
- [ ] Grep gate: no hex literals, no `bg-<palette>-<n>` classes in the new files.
- [ ] Dead-code sweep: `RecipePickerDialog` must still be imported by the
      **template editor** (`SlotCell`) and by nothing in the planner. If nothing
      imports `RecipeAutocomplete` any more, say so — do not delete it blind.
- [ ] **Visual pass (spec §7)** with the agent-browser harness + the seeded QA
      user, at 390px and 1300px: the add drawer (both breakpoints, balance
      footer, servings stepper), the copy dialog (both modes, and that append
      really appends — check the DB row count), the peek. Fix everything it
      finds, on this branch.
- [ ] **Only then** `gh pr create`. The auto-merge workflow ships the PR the
      moment CI is green — there is no second chance to fix it.

## Self-review notes

- Spec §6 wave-3 coverage: copy-meal popover (replace/append) → Tasks 4-5;
  "Añadir receta" drawer V1 with a live day-balance footer → Tasks 2-3;
  recipe peek as a docked drawer → Task 6; all three wired → Task 7. The
  anchored-popover tail is the one accepted divergence (see the decisions table).
- Deferred from wave 2 and paid off here: the `ResponsiveDialog` extraction
  (Task 1).
- Left for the doc-reconcile: `planner.noPlanToday` is unreachable copy;
  `week.noSlots` and `summary.emptyDay` were already dead before wave 3.
