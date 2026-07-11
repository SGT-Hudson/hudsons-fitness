# R-33 Wave 3 — Planificador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the weekly meal planner to the design canvas — a web day×meal
grid with tone-aware day headers, and a mobile week-strip + summary-chart +
today-list view — then (PR-B) rebuild its three interactions: add recipe, copy
meal, peek recipe.

**Architecture:** PR-A is a **view** rewrite: new presentational components in
`src/features/planning/components/`, all pure/prop-driven, fed by the existing
`useActiveWeek` query (no new `.select()`, no schema change). The tone core
(`src/core/nutritionTone.ts`) and `MacroBar` are reused verbatim — every colour
decision goes through `classify()`. `PlanificadorPage` becomes responsive by
CSS (`md:hidden` / `hidden md:block`), the same pattern `DiarioPage` uses. The
existing dialogs (apply template, save as template, shopping list, copy meal)
stay wired and unchanged in PR-A; PR-B replaces the add/copy/peek surfaces.

**Tech Stack:** React 18 + TS + Vite, Tailwind v4 (`@theme` tokens in
`src/index.css`), react-i18next (`planning` namespace), TanStack Query,
Vitest + Testing Library.

## Global Constraints

- **Metric only** (kg/cm/g). Never render imperial units.
- **No schema / RLS / RPC changes in this wave.** PR-B's copy-append is a
  plain single-table multi-row `insert()` — atomic in one statement, so hard
  invariant 3 ("any >1-table atomic mutation is an RPC") does not apply. No
  migration, no pgTAP change.
- **No new PostgREST `.select()` strings.** Everything renders off the existing
  `fetchActiveWeek` payload (`WeekSlotWithRecipe` already carries per-slot
  `macros`). R-32 standing rule ⇒ if you think you need a new select, stop and
  escalate.
- **Every new string in ES *and* EN.** Artboards are ES-only; mirror each key
  into `src/i18n/en/planning.json`.
- **Zero hardcoded palette classes or hex.** Colours come from the `@theme`
  tokens only (`tone-good`, `tone-warn`, `destructive`, `excess-*`, `macro-*`,
  `accent-*`, `phase-*`, `text-dim`, `muted`). CI greps for hex/`bg-red-500`
  style classes.
- **Numbers use the `tnum` class** (tabular figures) — every kcal/gram readout.
- `pnpm lint` + `pnpm build` + `pnpm test` green before any commit is pushed.
- **No AI/Claude attribution anywhere** — plain conventional commits.
- **`PageShell` renders the mobile header AND `PageHeaderV2` at once by
  design** (CSS hides one). In jsdom the page title appears **twice** — page
  tests must use `getAllByRole`/`getAllByText`. Do not "fix" this.

## Source authority

- Canvas web grid: `/mnt/d/dev/claude-design-hudson-fitness/src/planificador-web.jsx`
  (`PlaniDayHeader`, `PlanificadorWebV2`, `TODAY_OUTLINE`).
- Canvas mobile: `.../src/planificador-mobile-v2.jsx` (`PlanificadorMobileV2`).
- Canvas macro chip: `.../src/planificador-tone.jsx` (`MacroChipV4`).
- Spec: `docs/superpowers/specs/2026-07-02-r33-ui-redesign-design.md` §6 wave 3.

## Wave-3 strip-list (decided, do NOT build)

| Dropped | Why |
|---|---|
| Week navigation arrows (‹ Sem 22 ›) | Net-new: the app only ever shows the current week. Render the week label as static text. |
| Redesigned "Lista de la compra" panel | R-35. **Keep** the existing header button + `ShoppingListDialog` as they are. |
| "Comida libre" cells | `meal_plan_week_slots.recipe_id` is `NOT NULL` — free entries don't exist. Stays in R-43. |
| Fit-scored suggestions (add-drawer V2) | Net-new ranking feature; the wave ships add-drawer **V1** (live balance). |
| Recipe hue dots / avatars (mobile list) | No per-recipe colour or glyph in the schema (R-43 owns the glyph set). Render name + macro triad only. |
| Per-meal "hecho"/logged check | The eaten check-off idea is parked (see memory `diario-eaten-checkoff-idea`). |
| Notifications bell, burn readout | Wave-2 strip-list, same here. |

**Kept because the schema already carries them:** per-meal times (`meal_time`
on the slot, `default_meal_times` on the template) — render them in the grid
gutter and the mobile meal headers.

## File structure (PR-A)

| File | Responsibility |
|---|---|
| `src/features/planning/weekSummary.ts` *(new)* | Pure derivations: week averages, ISO week number, meal label by index. |
| `src/features/planning/weekSummary.test.ts` *(new)* | Tier-1 tests for the above. |
| `src/features/planning/components/DayMacroChip.tsx` *(new)* | Canvas `MacroChipV4`: letter + n/target + renormalised tone bar + fat-floor tick. |
| `src/features/planning/components/DayHeaderCard.tsx` *(new)* | Canvas `PlaniDayHeader`: status stripe, day+num, kcal hero + delta + bar, 2×2 chip grid, neutral today outline. |
| `src/features/planning/components/PlannerMealCell.tsx` *(new)* | Canvas meal cell: recipe bullets, copy button, inline "añadir", kcal·P·C·G footer, dashed empty state. Owns the (existing) `RecipePickerDialog` until PR-B. |
| `src/features/planning/components/WeekGrid.tsx` *(rewrite)* | The `92px + 7` grid: day-header row + one row per meal time. Drops the separate TOTAL row (day headers carry it now). |
| `src/components/ui/PhaseChip.tsx` *(new)* | Shared phase-tinted chip (`phase-cut/bulk/maint` tokens). Reused by waves 4 and 8. |
| `src/features/planning/components/WeekStrip.tsx` *(new)* | Mobile 7-cell strip: tone stripe + day letter + number + dot; today tinted. |
| `src/features/planning/components/WeekSummaryCard.tsx` *(new)* | Mobile summary: "Media diaria" hero + delta + the reused `WeeklyKcalChart`. |
| `src/features/planning/components/TodayPlanList.tsx` *(new)* | Mobile today list: per-meal header (name/time/kcal/copy) + recipe rows + "Añadir comida" footer. |
| `src/features/diario/components/WeeklyKcalChart.tsx` *(modify)* | Add `showHeader?: boolean` (default `true`) so the planner can embed it headerless. |
| `src/components/layout/PageShell.tsx` *(modify)* | Add optional `meta?: ReactNode` slot to `PageHeaderV2`/`PageShell` (rendered left of the spacer). |
| `src/pages/PlanificadorPage.tsx` *(rewrite)* | Responsive composition; header meta (week label, phase chip, week metrics); mobile stack vs `WeekGrid`. |
| `src/i18n/{es,en}/planning.json` *(modify)* | New keys (see Task 1). |

`DaySummary`, `SlotCell`, `TemplateGrid`, `CopyMealDialog`, `ApplyTemplateDialog`,
`SaveAsTemplateDialog`, `ShoppingListDialog` are **not touched** — the template
editor (wave 4) still uses `DaySummary`/`SlotCell`, so leave them alone.

---

## Task 1: Pure week derivations + i18n keys

**Files:**
- Create: `src/features/planning/weekSummary.ts`
- Test: `src/features/planning/weekSummary.test.ts`
- Modify: `src/i18n/es/planning.json`, `src/i18n/en/planning.json`

**Interfaces:**
- Consumes: `Macros`, `ZERO_MACROS`, `add` from `@/features/recipes/macros`.
- Produces:
  - `weekAverages(dayTotals: Macros[], targets?: Macros): WeekAverages` where
    `WeekAverages = { avgKcal: number; avgProteinG: number; proteinPct: number | null; kcalDelta: number | null }`
  - `isoWeekNumber(dateIso: string): number`
  - `mealLabelKey(mealIndex: number): { key: string; params?: { n: number } }`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/planning/weekSummary.test.ts
import { describe, it, expect } from 'vitest';
import { weekAverages, isoWeekNumber, mealLabelKey } from './weekSummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';

const m = (kcal: number, proteinG: number): Macros => ({
  ...ZERO_MACROS,
  kcal,
  proteinG,
});

describe('weekAverages', () => {
  it('averages over the 7 days it is given, including empty ones', () => {
    const days = [m(2100, 150), m(2300, 170), ZERO_MACROS, ZERO_MACROS, ZERO_MACROS, ZERO_MACROS, ZERO_MACROS];
    const r = weekAverages(days);
    expect(r.avgKcal).toBe(629); // round(4400 / 7)
    expect(r.avgProteinG).toBe(46); // round(320 / 7)
    expect(r.proteinPct).toBeNull();
    expect(r.kcalDelta).toBeNull();
  });

  it('derives protein % and kcal delta against the targets', () => {
    const days = Array.from({ length: 7 }, () => m(2240, 166));
    const r = weekAverages(days, { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 });
    expect(r.avgKcal).toBe(2240);
    expect(r.kcalDelta).toBe(60);
    expect(r.proteinPct).toBe(99); // round(166 / 168 * 100)
  });

  it('returns zeros for an empty week rather than NaN', () => {
    const r = weekAverages([]);
    expect(r.avgKcal).toBe(0);
    expect(r.avgProteinG).toBe(0);
  });

  it('guards a zero protein target (no division by zero)', () => {
    const r = weekAverages([m(2000, 100)], { kcal: 2000, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
    expect(r.proteinPct).toBeNull();
  });
});

describe('isoWeekNumber', () => {
  it('returns the ISO week of a Monday', () => {
    expect(isoWeekNumber('2026-05-25')).toBe(22);
  });
});

describe('mealLabelKey', () => {
  it('names the first four meals', () => {
    expect(mealLabelKey(0)).toEqual({ key: 'planner.mealName.0' });
    expect(mealLabelKey(3)).toEqual({ key: 'planner.mealName.3' });
  });

  it('falls back to a numbered label beyond the fourth', () => {
    expect(mealLabelKey(4)).toEqual({ key: 'planner.mealNameN', params: { n: 5 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/weekSummary.test.ts`
Expected: FAIL — "Failed to resolve import ./weekSummary".

- [ ] **Step 3: Write the implementation**

```ts
// src/features/planning/weekSummary.ts
import { getISOWeek, parseISO } from 'date-fns';
import { add, ZERO_MACROS, type Macros } from '@/features/recipes/macros';

export interface WeekAverages {
  avgKcal: number;
  avgProteinG: number;
  /** Average protein as a % of target; null when there is no usable target. */
  proteinPct: number | null;
  /** Average kcal minus the kcal target; null when there is no target. */
  kcalDelta: number | null;
}

/** Week-level readouts for the planner header and the mobile summary card. */
export function weekAverages(dayTotals: Macros[], targets?: Macros): WeekAverages {
  if (dayTotals.length === 0) {
    return { avgKcal: 0, avgProteinG: 0, proteinPct: null, kcalDelta: null };
  }
  const sum = dayTotals.reduce((acc, d) => add(acc, d), ZERO_MACROS);
  const avgKcal = Math.round(sum.kcal / dayTotals.length);
  const avgProteinG = Math.round(sum.proteinG / dayTotals.length);
  const hasProteinTarget = targets != null && targets.proteinG > 0;
  const hasKcalTarget = targets != null && targets.kcal > 0;
  return {
    avgKcal,
    avgProteinG,
    proteinPct: hasProteinTarget ? Math.round((avgProteinG / targets!.proteinG) * 100) : null,
    kcalDelta: hasKcalTarget ? avgKcal - targets!.kcal : null,
  };
}

/** ISO week number ("Sem 22") of an ISO `YYYY-MM-DD` date. */
export function isoWeekNumber(dateIso: string): number {
  return getISOWeek(parseISO(dateIso));
}

/**
 * Meal names are positional: the schema stores `meal_index` + `meal_time`, not
 * a name, and templates in practice define the classic four. Index 0–3 get the
 * named keys; anything beyond falls back to a numbered label.
 */
export function mealLabelKey(mealIndex: number): { key: string; params?: { n: number } } {
  if (mealIndex >= 0 && mealIndex <= 3) return { key: `planner.mealName.${mealIndex}` };
  return { key: 'planner.mealNameN', params: { n: mealIndex + 1 } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/weekSummary.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add the i18n keys**

In `src/i18n/es/planning.json`, add to the existing `summary` object:

```json
"letter": { "protein": "P", "carbs": "C", "fat": "G", "fiber": "F" }
```

and add to the existing `planner` object:

```json
"weekLabel": "Sem {{week}} · {{from}} → {{to}}",
"avgDaily": "Media diaria",
"avgKcal": "Media",
"proteinAvg": "Proteína",
"proteinPct": "· {{pct}} %",
"targetShort": "Objetivo {{n}}",
"kcalPerDay": "{{n}} kcal / día",
"todayHeading": "Hoy · {{date}}",
"todayKcal": "{{consumed}} / {{target}} kcal",
"addMeal": "Añadir comida",
"mealName": { "0": "Desayuno", "1": "Comida", "2": "Merienda", "3": "Cena" },
"mealNameN": "Comida {{n}}",
"noPlanToday": "Hoy no tienes nada planificado."
```

and add a new top-level `cell` object:

```json
"cell": {
  "addFirst": "añadir comida",
  "addMore": "añadir",
  "kcal": "kcal"
}
```

In `src/i18n/en/planning.json`, mirror all of them:

```json
"letter": { "protein": "P", "carbs": "C", "fat": "F", "fiber": "Fb" }
```

```json
"weekLabel": "Week {{week}} · {{from}} → {{to}}",
"avgDaily": "Daily average",
"avgKcal": "Average",
"proteinAvg": "Protein",
"proteinPct": "· {{pct}}%",
"targetShort": "Target {{n}}",
"kcalPerDay": "{{n}} kcal / day",
"todayHeading": "Today · {{date}}",
"todayKcal": "{{consumed}} / {{target}} kcal",
"addMeal": "Add meal",
"mealName": { "0": "Breakfast", "1": "Lunch", "2": "Snack", "3": "Dinner" },
"mealNameN": "Meal {{n}}",
"noPlanToday": "Nothing planned for today."
```

```json
"cell": {
  "addFirst": "add meal",
  "addMore": "add",
  "kcal": "kcal"
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm lint && pnpm vitest run src/features/planning/`
Expected: PASS.

```bash
git add src/features/planning/weekSummary.ts src/features/planning/weekSummary.test.ts src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "feat(planner): week-average derivations and wave-3 i18n keys"
```

---

## Task 2: DayMacroChip

**Files:**
- Create: `src/features/planning/components/DayMacroChip.tsx`
- Test: `src/features/planning/components/DayMacroChip.test.tsx`

**Interfaces:**
- Consumes: `classify`, `PhaseType`, `Tone` from `@/core/nutritionTone`; `MacroBar` from `@/components/ui/MacroBar`; `roundMacro` from `@/features/recipes/macros`; i18n key `summary.letter.<metric>` (Task 1).
- Produces: `DayMacroChip({ metric, consumed, target, phase, floorG, className })` and `export type ChipMetric = 'protein' | 'carbs' | 'fat' | 'fiber'`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/DayMacroChip.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayMacroChip } from './DayMacroChip';

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('DayMacroChip', () => {
  it('renders the metric letter and the consumed / target numbers', () => {
    render(<DayMacroChip metric="protein" consumed={165} target={168} phase="cut" />);
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('165')).toBeInTheDocument();
    expect(screen.getByText('168')).toBeInTheDocument();
  });

  it('paints an excess segment when consumed is over target', () => {
    const { container } = render(
      <DayMacroChip metric="carbs" consumed={275} target={245} phase="cut" />,
    );
    // Over target in a cut → MacroBar renders a second, excess-toned segment.
    expect(container.querySelector('[data-seg][data-excess]')).not.toBeNull();
  });

  it('outlines the chip when fat sits below the essential floor', () => {
    const { container } = render(
      <DayMacroChip metric="fat" consumed={30} target={68} phase="cut" floorG={48} />,
    );
    const chip = container.querySelector('[data-macro="fat"]');
    expect(chip?.className).toContain('border-destructive');
    expect(container.querySelector('[data-tick="min"]')).not.toBeNull();
  });

  it('stays neutral with no target', () => {
    const { container } = render(<DayMacroChip metric="fiber" consumed={12} />);
    expect(container.querySelector('[data-seg]')).toBeNull();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/components/DayMacroChip.test.tsx`
Expected: FAIL — "Failed to resolve import ./DayMacroChip".

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/planning/components/DayMacroChip.tsx
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MacroBar } from '@/components/ui/MacroBar';
import { roundMacro } from '@/features/recipes/macros';
import { classify, type PhaseType, type Tone } from '@/core/nutritionTone';

/** kcal has the day-header hero, not a chip. */
export type ChipMetric = 'protein' | 'carbs' | 'fat' | 'fiber';

// Per-component tone maps — this codebase's convention (see MacroBar, MacroTile).
const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

const SOFT_BG: Record<Tone, string> = {
  good: 'bg-tone-good/12',
  onTarget: 'bg-tone-good/12',
  slightOver: 'bg-tone-warn/12',
  low: 'bg-tone-warn/12',
  over: 'bg-destructive/12',
  neutral: 'bg-muted',
};

const BORDER_TONE: Record<Tone, string> = {
  good: 'border-tone-good',
  onTarget: 'border-tone-good',
  slightOver: 'border-tone-warn',
  low: 'border-tone-warn',
  over: 'border-destructive',
  neutral: 'border-border',
};

interface Props {
  metric: ChipMetric;
  consumed: number;
  target?: number;
  phase?: PhaseType;
  /** Fat only: essential floor in grams — draws the bar tick and outlines the chip below it. */
  floorG?: number;
  className?: string;
}

/**
 * The canvas `MacroChipV4`: a tone-tinted micro-card for one macro inside the
 * day header. The bar (renormalisation, excess segment, floor tick) is
 * `MacroBar` as-is — no duplicated segment math.
 */
export function DayMacroChip({ metric, consumed, target, phase, floorG, className }: Props) {
  const { t } = useTranslation('planning');
  const s = classify(
    metric,
    consumed,
    target,
    phase,
    metric === 'fat' && floorG != null ? { fatFloorG: floorG } : undefined,
  );
  const hasTarget = target != null && target > 0;
  const fatBelowFloor = metric === 'fat' && floorG != null && consumed < floorG;

  return (
    <div
      data-macro={metric}
      className={cn(
        'flex min-w-0 flex-col gap-[3px] rounded-[5px] border px-1.5 pb-[5px] pt-1',
        SOFT_BG[s.tone],
        fatBelowFloor ? BORDER_TONE[s.tone] : 'border-transparent',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className={cn('text-[9.5px] font-bold tracking-[0.05em]', TEXT_TONE[s.tone])}>
          {t(`summary.letter.${metric}`)}
        </span>
        <span className="tnum text-[9px] text-text-dim">
          <b className="font-medium text-foreground">{roundMacro(consumed)}</b>
          {hasTarget && (
            <>
              <span className="mx-px opacity-60">/</span>
              {roundMacro(target!)}
            </>
          )}
        </span>
      </div>
      {hasTarget && (
        <MacroBar
          consumed={consumed}
          target={target!}
          tone={s.tone}
          excess={s.excess}
          minFloorG={s.minFloorG}
          className="h-[3px]"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/components/DayMacroChip.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/DayMacroChip.tsx src/features/planning/components/DayMacroChip.test.tsx
git commit -m "feat(planner): tone-aware day macro chip"
```

---

## Task 3: DayHeaderCard

**Files:**
- Create: `src/features/planning/components/DayHeaderCard.tsx`
- Test: `src/features/planning/components/DayHeaderCard.test.tsx`

**Interfaces:**
- Consumes: `DayMacroChip` (Task 2); `classify`, `essentialFatFloorG`, `PhaseType`, `Tone` from `@/core/nutritionTone`; `MacroBar`; `Macros`, `roundMacro` from `@/features/recipes/macros`; `formatDate`, `Locale` from `@/lib/dates`.
- Produces: `DayHeaderCard({ dateIso, isToday, isPast, totals, targets, phaseType, weightKg, className })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/DayHeaderCard.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayHeaderCard } from './DayHeaderCard';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';

const targets: Macros = { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 };
const totals: Macros = { kcal: 2240, proteinG: 175, carbsG: 250, fatG: 65, fiberG: 28 };

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('DayHeaderCard', () => {
  it('renders the day number, the kcal hero and the signed delta', () => {
    render(
      <DayHeaderCard dateIso="2026-05-26" isToday totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(screen.getByText('26')).toBeInTheDocument();
    expect(screen.getByText('2240')).toBeInTheDocument();
    expect(screen.getByText('+60')).toBeInTheDocument();
  });

  it('paints the status stripe with the kcal tone (cut, +2.8% → slightOver)', () => {
    const { container } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday={false} totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(container.querySelector('[data-stripe]')?.className).toContain('bg-tone-warn');
  });

  it('outlines today neutrally (no tone colour on the border)', () => {
    const { container } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday totals={totals} targets={targets} phaseType="cut" />,
    );
    const card = container.querySelector('[data-day-header]');
    expect(card?.className).toContain('border-text-dim');
  });

  it('renders one chip per macro', () => {
    const { container } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday={false} totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(container.querySelectorAll('[data-macro]').length).toBe(4);
  });

  it('survives a day with no targets and no slots', () => {
    const { container } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday={false} totals={ZERO_MACROS} />,
    );
    expect(container.querySelector('[data-day-header]')).not.toBeNull();
    expect(screen.queryByText('+0')).toBeNull(); // no target ⇒ no delta readout
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/components/DayHeaderCard.test.tsx`
Expected: FAIL — "Failed to resolve import ./DayHeaderCard".

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/planning/components/DayHeaderCard.tsx
import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { MacroBar } from '@/components/ui/MacroBar';
import { DayMacroChip } from './DayMacroChip';
import { roundMacro, type Macros } from '@/features/recipes/macros';
import { classify, essentialFatFloorG, type PhaseType, type Tone } from '@/core/nutritionTone';
import { formatDate, type Locale } from '@/lib/dates';

const BG_TONE: Record<Tone, string> = {
  good: 'bg-tone-good',
  onTarget: 'bg-tone-good',
  slightOver: 'bg-tone-warn',
  low: 'bg-tone-warn',
  over: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
};

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface Props {
  /** ISO `YYYY-MM-DD`. */
  dateIso: string;
  isToday: boolean;
  isPast?: boolean;
  totals: Macros;
  targets?: Macros;
  phaseType?: PhaseType;
  /** Bodyweight in kg — derives the fat floor at render (hard invariant 5). */
  weightKg?: number;
  className?: string;
}

/**
 * The canvas `PlaniDayHeader`: a tone-striped column head carrying the day's
 * planned kcal against target and a 2×2 macro-chip grid. Today is marked with a
 * *neutral* outline, deliberately — a coloured one would collide with the
 * semantic tone palette (canvas `TODAY_OUTLINE`).
 */
export function DayHeaderCard({
  dateIso,
  isToday,
  isPast,
  totals,
  targets,
  phaseType,
  weightKg,
  className,
}: Props) {
  const { i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const date = parseISO(dateIso);

  const kcal = classify('kcal', totals.kcal, targets?.kcal, phaseType);
  const hasKcalTarget = targets != null && targets.kcal > 0;
  const delta = hasKcalTarget ? Math.round(totals.kcal - targets!.kcal) : null;
  const fatFloor = weightKg != null ? essentialFatFloorG(weightKg) : undefined;

  return (
    <div
      data-day-header
      className={cn(
        'relative flex flex-col gap-1.5 self-start overflow-hidden rounded-md border bg-card px-2.5 pb-2.5 pt-2',
        isToday ? 'border-text-dim' : 'border-border',
        isPast && 'opacity-60',
        className,
      )}
    >
      <span
        data-stripe
        aria-hidden="true"
        className={cn('absolute inset-x-0 top-0 h-[3px]', BG_TONE[kcal.tone])}
      />

      <div className="mt-px flex items-baseline gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim">
          {formatDate(date, 'EEE', locale)}
        </span>
        <span className="tnum text-base font-semibold leading-none">
          {formatDate(date, 'd', locale)}
        </span>
      </div>

      <div>
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              'tnum text-[19px] font-semibold leading-none tracking-[-0.03em]',
              TEXT_TONE[kcal.tone],
            )}
          >
            {roundMacro(totals.kcal)}
          </span>
          {/* "kcal" is the same token in both locales — a unit, not a translated word. */}
          <span className="text-[9px] text-text-dim">kcal</span>
          <div className="flex-1" />
          {delta != null && (
            <span className={cn('tnum text-[10px] font-semibold', TEXT_TONE[kcal.tone])}>
              {delta >= 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
        {hasKcalTarget && (
          <MacroBar
            consumed={totals.kcal}
            target={targets!.kcal}
            tone={kcal.tone}
            excess={kcal.excess}
            className="mt-1 h-[3px]"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-[3px]">
        <DayMacroChip metric="protein" consumed={totals.proteinG} target={targets?.proteinG} phase={phaseType} />
        <DayMacroChip metric="carbs" consumed={totals.carbsG} target={targets?.carbsG} phase={phaseType} />
        <DayMacroChip metric="fat" consumed={totals.fatG} target={targets?.fatG} phase={phaseType} floorG={fatFloor} />
        <DayMacroChip metric="fiber" consumed={totals.fiberG} target={targets?.fiberG} phase={phaseType} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/components/DayHeaderCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/DayHeaderCard.tsx src/features/planning/components/DayHeaderCard.test.tsx
git commit -m "feat(planner): day header card with kcal hero and macro chips"
```

---

## Task 4: PlannerMealCell

**Files:**
- Create: `src/features/planning/components/PlannerMealCell.tsx`
- Test: `src/features/planning/components/PlannerMealCell.test.tsx`

**Interfaces:**
- Consumes: `RecipePickerDialog` from `./RecipePickerDialog` (unchanged, PR-B replaces it); `add`, `ZERO_MACROS`, `roundMacro`, `Macros` from `@/features/recipes/macros`.
- Produces:
  ```ts
  export interface PlannerCellEntry {
    id: string;
    recipe_id: string;
    recipe_name: string;
    servings: number;
    macros: Macros; // this slot's contribution (per-serving × servings)
  }
  ```
  `PlannerMealCell({ entries, onAdd, onUpdate, onRemove, onCopy, busy, className })` with
  `onAdd(recipeId, recipeName, servings)`, `onUpdate(entryId, recipeId, recipeName, servings)`,
  `onRemove(entryId)`, `onCopy?()`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/PlannerMealCell.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlannerMealCell, type PlannerCellEntry } from './PlannerMealCell';
import { ZERO_MACROS } from '@/features/recipes/macros';

// The cell mounts the (closed) RecipePickerDialog, which transitively imports the
// Supabase client; stub the recipe hook so the import chain stays inert.
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const entry = (over: Partial<PlannerCellEntry> = {}): PlannerCellEntry => ({
  id: 'e1',
  recipe_id: 'r1',
  recipe_name: 'Lentejas estofadas',
  servings: 1,
  macros: { ...ZERO_MACROS, kcal: 542, proteinG: 38, carbsG: 68, fatG: 12 },
  ...over,
});

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('PlannerMealCell', () => {
  it('lists the recipes and sums the cell footer', () => {
    renderWithClient(
      <PlannerMealCell
        entries={[entry(), entry({ id: 'e2', recipe_name: 'Pan integral', macros: { ...ZERO_MACROS, kcal: 156, proteinG: 6, carbsG: 28, fatG: 2 } })]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.getByText('Pan integral')).toBeInTheDocument();
    expect(screen.getByText('698')).toBeInTheDocument(); // 542 + 156 kcal
    expect(screen.getByText('44')).toBeInTheDocument(); // protein
  });

  it('marks a servings multiplier only when it is not 1', () => {
    renderWithClient(
      <PlannerMealCell entries={[entry({ servings: 2 })]} onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  it('renders a dashed empty state with an add affordance', () => {
    const { container } = renderWithClient(
      <PlannerMealCell entries={[]} onAdd={noop} onUpdate={noop} onRemove={noop} />,
    );
    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /añadir comida/i })).toBeInTheDocument();
  });

  it('shows the copy affordance only when the cell has entries', async () => {
    const onCopy = vi.fn();
    const { rerender } = renderWithClient(
      <PlannerMealCell entries={[]} onAdd={noop} onUpdate={noop} onRemove={noop} onCopy={onCopy} />,
    );
    expect(screen.queryByRole('button', { name: /copiar/i })).toBeNull();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PlannerMealCell entries={[entry()]} onAdd={noop} onUpdate={noop} onRemove={noop} onCopy={onCopy} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /copiar/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/components/PlannerMealCell.test.tsx`
Expected: FAIL — "Failed to resolve import ./PlannerMealCell".

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/planning/components/PlannerMealCell.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RecipePickerDialog } from './RecipePickerDialog';
import { add, roundMacro, ZERO_MACROS, type Macros } from '@/features/recipes/macros';

export interface PlannerCellEntry {
  id: string;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  /** This slot's macros (recipe per-serving × servings), straight off the query. */
  macros: Macros;
}

interface Props {
  entries: PlannerCellEntry[];
  onAdd: (recipeId: string, recipeName: string, servings: number) => void | Promise<void>;
  onUpdate: (
    entryId: string,
    recipeId: string,
    recipeName: string,
    servings: number,
  ) => void | Promise<void>;
  onRemove: (entryId: string) => void | Promise<void>;
  onCopy?: () => void;
  busy?: boolean;
  className?: string;
}

/**
 * One (day × meal) cell of the web grid: recipe bullets, a copy affordance, an
 * inline add link and a kcal·P·C·G footer; dashed + sunken when empty. Editing
 * and deleting still go through `RecipePickerDialog` — PR-B swaps that for the
 * add drawer and the recipe peek.
 */
export function PlannerMealCell({
  entries,
  onAdd,
  onUpdate,
  onRemove,
  onCopy,
  busy,
  className,
}: Props) {
  const { t } = useTranslation('planning');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerCellEntry | null>(null);
  const empty = entries.length === 0;
  const cell = entries.reduce<Macros>((acc, e) => add(acc, e.macros), ZERO_MACROS);

  function openAdd() {
    setEditing(null);
    setPickerOpen(true);
  }
  function openEdit(entry: PlannerCellEntry) {
    setEditing(entry);
    setPickerOpen(true);
  }

  return (
    <div
      data-empty={empty}
      className={cn(
        'relative flex flex-col gap-1 rounded-md border p-2.5',
        empty ? 'border-dashed bg-muted' : 'bg-card',
        className,
      )}
    >
      {empty ? (
        <button
          type="button"
          onClick={openAdd}
          disabled={busy}
          className="flex h-full min-h-12 items-center justify-center gap-1 text-[11px] text-text-dim hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('cell.addFirst')}
        </button>
      ) : (
        <>
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              aria-label={t('slot.copy')}
              title={t('slot.copy')}
              disabled={busy}
              className="absolute right-1.5 top-1.5 grid h-[22px] w-[22px] place-items-center rounded-md border border-transparent text-text-dim hover:border-accent-line hover:bg-accent-soft hover:text-accent-ink"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}

          <div className="flex flex-col gap-0.5 pr-6">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => openEdit(e)}
                className="flex items-baseline gap-1.5 text-left text-[11.5px] leading-tight hover:underline"
              >
                <span aria-hidden="true" className="shrink-0 text-[9px] text-text-dim">
                  •
                </span>
                <span className="min-w-0 truncate font-medium">{e.recipe_name}</span>
                {e.servings !== 1 && (
                  <span className="tnum shrink-0 text-[10px] text-text-dim">×{e.servings}</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openAdd}
            disabled={busy}
            className="-ml-1 mt-0.5 inline-flex items-center gap-1 self-start rounded px-1 py-0.5 text-[10.5px] text-text-dim hover:text-foreground"
          >
            <Plus className="h-2.5 w-2.5" />
            {t('cell.addMore')}
          </button>

          <div className="tnum mt-auto flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-t pt-1 text-[10px] text-text-dim">
            <span>
              <b className="font-medium text-muted-foreground">{roundMacro(cell.kcal)}</b>{' '}
              {t('cell.kcal')}
            </span>
            <span>
              {roundMacro(cell.proteinG)} <span className="opacity-65">{t('summary.letter.protein')}</span>
            </span>
            <span>
              {roundMacro(cell.carbsG)} <span className="opacity-65">{t('summary.letter.carbs')}</span>
            </span>
            <span>
              {roundMacro(cell.fatG)} <span className="opacity-65">{t('summary.letter.fat')}</span>
            </span>
          </div>
        </>
      )}

      <RecipePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialRecipe={
          editing
            ? { id: editing.recipe_id, name: editing.recipe_name, servings: editing.servings }
            : null
        }
        busy={busy}
        onSave={async (recipeId, recipeName, servings) => {
          if (editing) await onUpdate(editing.id, recipeId, recipeName, servings);
          else await onAdd(recipeId, recipeName, servings);
        }}
        onDelete={
          editing
            ? async () => {
                await onRemove(editing.id);
                setPickerOpen(false);
              }
            : undefined
        }
      />
    </div>
  );
}
```

**Behaviour note:** the per-entry "×" remove button of the old `SlotCell` is
gone — deletion now happens in the picker dialog (which already has a Delete
action), matching the canvas cell. Nothing becomes unreachable.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/components/PlannerMealCell.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/PlannerMealCell.tsx src/features/planning/components/PlannerMealCell.test.tsx
git commit -m "feat(planner): meal cell with recipe bullets and macro footer"
```

---

## Task 5: WeekGrid rewrite

**Files:**
- Modify: `src/features/planning/components/WeekGrid.tsx` (full rewrite)
- Modify: `src/features/planning/components/WeekGrid.test.tsx`

**Interfaces:**
- Consumes: `DayHeaderCard` (Task 3), `PlannerMealCell` + `PlannerCellEntry` (Task 4), `mealLabelKey` (Task 1), `aggregateDayMacros` from `@/features/planning/daySummary`, `WeekSlotWithRecipe` from `@/features/planner/api`.
- Produces: same `WeekGrid` props as today (`weekStart`, `slots`, `mealTimes`, `todayIso`, `onAdd`, `onUpdate`, `onRemove`, `busy`, `targets`, `phaseType`, `weightKg`, `onCopyMeal`) — the page keeps working unchanged. Only the rendering changes.

- [ ] **Step 1: Update the test to the new structure**

Replace the body of `src/features/planning/components/WeekGrid.test.tsx` with:

```tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeekGrid } from './WeekGrid';
import type { WeekSlotWithRecipe } from '@/features/planner/api';
import { ZERO_MACROS } from '@/features/recipes/macros';

vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const slot = (over: Partial<WeekSlotWithRecipe>): WeekSlotWithRecipe => ({
  id: 'id',
  date: '2026-05-25',
  meal_index: 0,
  meal_time: '08:00',
  recipe_id: 'r',
  recipe_name: 'Avena',
  servings: 1,
  display_order: 0,
  macros: ZERO_MACROS,
  ...over,
});

const targets = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 };
const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('WeekGrid — aligned matrix', () => {
  it('labels each configured meal row with its name and time', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00', '13:00', '17:00', '21:00']}
        slots={[slot({ id: 's1' })]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Desayuno')).toBeInTheDocument();
    expect(screen.getByText('Cena')).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
  });

  it('renders one day header per day, carrying the day totals', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 's1', macros: { ...ZERO_MACROS, kcal: 500 } })]}
        targets={targets}
        phaseType="cut"
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(container.querySelectorAll('[data-day-header]').length).toBe(7);
    expect(screen.getByText('500')).toBeInTheDocument(); // Monday's kcal hero
  });

  it("shows a populated cell's recipe", () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 's1', date: '2026-05-26', recipe_name: 'Tortilla' })]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Tortilla')).toBeInTheDocument();
  });

  it('renders an orphan slot (meal_index beyond mealTimes) in its own numbered row', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[
          slot({ id: 'o1', date: '2026-05-27', meal_index: 4, meal_time: '23:00', recipe_name: 'Snack' }),
        ]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Comida 5')).toBeInTheDocument();
    expect(screen.getByText('23:00')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  it('outlines today neutrally and dims past days', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-27"
        mealTimes={['08:00']}
        slots={[]}
        targets={targets}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    expect(container.querySelector('[data-day-header].border-text-dim')).not.toBeNull();
    expect(container.querySelector('.opacity-60')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/components/WeekGrid.test.tsx`
Expected: FAIL — "Desayuno" not found (the current grid renders only times).

- [ ] **Step 3: Rewrite WeekGrid**

```tsx
// src/features/planning/components/WeekGrid.tsx
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { DayHeaderCard } from './DayHeaderCard';
import { PlannerMealCell, type PlannerCellEntry } from './PlannerMealCell';
import { mealLabelKey } from '@/features/planning/weekSummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { PhaseType } from '@/core/nutritionTone';
import type { WeekSlotWithRecipe } from '@/features/planner/api';

interface Props {
  weekStart: string;
  slots: WeekSlotWithRecipe[];
  mealTimes: string[];
  todayIso: string;
  onAdd: (
    date: string,
    mealIndex: number,
    mealTime: string | null,
    recipe: { id: string; name: string },
    servings: number,
  ) => void | Promise<void>;
  onUpdate: (
    slotId: string,
    recipe: { id: string; name: string },
    servings: number,
  ) => void | Promise<void>;
  onRemove: (slotId: string) => void | Promise<void>;
  busy?: boolean;
  targets?: Macros;
  phaseType?: PhaseType;
  weightKg?: number;
  onCopyMeal?: (date: string, mealIndex: number) => void;
}

interface Row {
  mealIndex: number;
  mealTime: string | null;
}

function toEntry(s: WeekSlotWithRecipe): PlannerCellEntry {
  return {
    id: s.id,
    recipe_id: s.recipe_id,
    recipe_name: s.recipe_name,
    servings: s.servings,
    macros: s.macros,
  };
}

/**
 * The web weekly grid (canvas `PlanificadorWebV2`): a `92px + 7` matrix of
 * tone-aware day headers over one row per configured meal time. The day header
 * carries the day totals, so there is no separate TOTAL row any more.
 */
export function WeekGrid({
  weekStart,
  slots,
  mealTimes,
  todayIso,
  onAdd,
  onUpdate,
  onRemove,
  busy,
  targets,
  phaseType,
  weightKg,
  onCopyMeal,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const weekStartDate = parseISO(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = formatDate(addDays(weekStartDate, i), 'yyyy-MM-dd', locale);
    return { date: iso, isToday: iso === todayIso, isPast: iso < todayIso };
  });

  // Row model: one row per configured meal time, then orphan rows (slots whose
  // meal_index is beyond the configured times — divergent weeks), built from the
  // union of (meal_index, meal_time) across the week so the matrix stays aligned.
  const rows: Row[] = mealTimes.map((time, i) => ({ mealIndex: i, mealTime: time }));
  const orphans = new Map<string, Row>();
  for (const s of slots) {
    if (s.meal_index < mealTimes.length) continue;
    const key = `${s.meal_index}|${s.meal_time ?? ''}`;
    if (!orphans.has(key)) orphans.set(key, { mealIndex: s.meal_index, mealTime: s.meal_time });
  }
  const orphanRows = Array.from(orphans.values()).sort(
    (a, b) => a.mealIndex - b.mealIndex || (a.mealTime ?? '').localeCompare(b.mealTime ?? ''),
  );
  const allRows = [...rows, ...orphanRows];

  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));

  function entriesFor(date: string, row: Row): PlannerCellEntry[] {
    return slots
      .filter(
        (s) =>
          s.date === date &&
          s.meal_index === row.mealIndex &&
          (s.meal_time ?? '') === (row.mealTime ?? ''),
      )
      .sort((a, b) => a.display_order - b.display_order)
      .map(toEntry);
  }

  function mealLabel(mealIndex: number): string {
    const { key, params } = mealLabelKey(mealIndex);
    return t(key, params ?? {});
  }

  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <div
        className="grid min-w-max gap-1.5"
        style={{ gridTemplateColumns: '92px repeat(7, minmax(150px, 1fr))' }}
      >
        {/* Day headers */}
        <div />
        {days.map((day) => (
          <DayHeaderCard
            key={`h-${day.date}`}
            dateIso={day.date}
            isToday={day.isToday}
            isPast={day.isPast}
            totals={dayTotals.get(day.date) ?? ZERO_MACROS}
            targets={targets}
            phaseType={phaseType}
            weightKg={weightKg}
          />
        ))}

        {/* Meal rows */}
        {allRows.map((row) => (
          <Fragment key={`row-${row.mealIndex}-${row.mealTime ?? ''}`}>
            <div className="flex flex-col justify-center px-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                {mealLabel(row.mealIndex)}
              </span>
              {row.mealTime && (
                <span className="tnum mt-0.5 text-[10px] text-text-dim opacity-70">
                  {row.mealTime.slice(0, 5)}
                </span>
              )}
            </div>
            {days.map((day) => (
              <PlannerMealCell
                key={`${day.date}-${row.mealIndex}-${row.mealTime ?? ''}`}
                entries={entriesFor(day.date, row)}
                busy={busy}
                className={cn(day.isToday && 'border-text-dim', day.isPast && 'opacity-60')}
                onAdd={(recipeId, recipeName, servings) =>
                  onAdd(
                    day.date,
                    row.mealIndex,
                    row.mealTime,
                    { id: recipeId, name: recipeName },
                    servings,
                  )
                }
                onUpdate={(slotId, recipeId, recipeName, servings) =>
                  onUpdate(slotId, { id: recipeId, name: recipeName }, servings)
                }
                onRemove={(slotId) => onRemove(slotId)}
                onCopy={onCopyMeal ? () => onCopyMeal(day.date, row.mealIndex) : undefined}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/features/planning/`
Expected: PASS. `DaySummary.test.tsx` and `SlotCell.test.tsx` must stay green —
those components are untouched and still used by the template editor.

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/WeekGrid.tsx src/features/planning/components/WeekGrid.test.tsx
git commit -m "feat(planner): rebuild the web week grid on day headers and meal cells"
```

---

## Task 6: PhaseChip + mobile WeekStrip + WeekSummaryCard

**Files:**
- Create: `src/components/ui/PhaseChip.tsx`, `src/components/ui/PhaseChip.test.tsx`
- Create: `src/features/planning/components/WeekStrip.tsx`, `src/features/planning/components/WeekStrip.test.tsx`
- Create: `src/features/planning/components/WeekSummaryCard.tsx`, `src/features/planning/components/WeekSummaryCard.test.tsx`
- Modify: `src/features/diario/components/WeeklyKcalChart.tsx` (add `showHeader?: boolean`)

**Interfaces:**
- Consumes: `PhaseType` from `@/core/nutritionTone`; phase labels live in the **`objetivos`** namespace at `phases.type.{cut,maintenance,bulk}`; `WeeklyKcalChart` + `WeeklyKcalDay` from `@/features/diario/components/WeeklyKcalChart`; `weekAverages` (Task 1).
- Produces:
  - `PhaseChip({ phase, className })`
  - `WeekStrip({ days, target, phase, className })` with `days: { date: string; kcal: number; isToday: boolean }[]`
  - `WeekSummaryCard({ days, targets, phase, className })` with the same `days` shape.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ui/PhaseChip.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhaseChip } from './PhaseChip';

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('PhaseChip', () => {
  it('labels and tints a cut', () => {
    const { container } = render(<PhaseChip phase="cut" />);
    expect(screen.getByText('Corte')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('bg-phase-cut-soft');
  });

  it('labels and tints a bulk', () => {
    const { container } = render(<PhaseChip phase="bulk" />);
    expect(screen.getByText('Volumen')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('bg-phase-bulk-soft');
  });
});
```

```tsx
// src/features/planning/components/WeekStrip.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { WeekStrip } from './WeekStrip';

const days = [
  { date: '2026-05-25', kcal: 2168, isToday: false },
  { date: '2026-05-26', kcal: 2240, isToday: true },
  { date: '2026-05-27', kcal: 2095, isToday: false },
  { date: '2026-05-28', kcal: 2210, isToday: false },
  { date: '2026-05-29', kcal: 2280, isToday: false },
  { date: '2026-05-30', kcal: 2540, isToday: false },
  { date: '2026-05-31', kcal: 2104, isToday: false },
];

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('WeekStrip', () => {
  it('renders one cell per day with its day number', () => {
    const { container } = render(<WeekStrip days={days} target={2180} phase="cut" />);
    expect(container.querySelectorAll('[data-day]').length).toBe(7);
    expect(container.querySelector('[data-day="2026-05-30"]')?.textContent).toContain('30');
  });

  it('tints the over-target day red and today with the accent', () => {
    const { container } = render(<WeekStrip days={days} target={2180} phase="cut" />);
    // Saturday is 2540 kcal on a 2180 cut target → over (>5%).
    const sat = container.querySelector('[data-day="2026-05-30"] [data-stripe]');
    expect(sat?.className).toContain('bg-destructive');
    const today = container.querySelector('[data-day="2026-05-26"]');
    expect(today?.className).toContain('bg-accent-soft');
  });

  it('stays neutral with no target', () => {
    const { container } = render(<WeekStrip days={days} />);
    expect(container.querySelector('[data-day="2026-05-30"] [data-stripe]')?.className).toContain(
      'bg-muted-foreground/50',
    );
  });
});
```

```tsx
// src/features/planning/components/WeekSummaryCard.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekSummaryCard } from './WeekSummaryCard';

const days = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-05-${25 + i}`,
  kcal: 2240,
  isToday: i === 1,
}));

const targets = { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 };

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('WeekSummaryCard', () => {
  it('shows the daily average and the signed per-day delta', () => {
    render(<WeekSummaryCard days={days} targets={targets} phase="cut" />);
    expect(screen.getByText('2240')).toBeInTheDocument();
    expect(screen.getByText(/\+60 kcal/)).toBeInTheDocument();
  });

  it('embeds the weekly chart without its own header', () => {
    const { container } = render(<WeekSummaryCard days={days} targets={targets} phase="cut" />);
    expect(container.querySelectorAll('[data-testid="weekly-kcal-bar"]').length).toBe(7);
    expect(screen.queryByText('Semana')).toBeNull(); // chart header suppressed
  });

  it('renders without targets', () => {
    render(<WeekSummaryCard days={days} />);
    expect(screen.getByText('2240')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/ui/PhaseChip.test.tsx src/features/planning/components/WeekStrip.test.tsx src/features/planning/components/WeekSummaryCard.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write the implementations**

```tsx
// src/components/ui/PhaseChip.tsx
import { useTranslation } from 'react-i18next';
import { Flame, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PhaseType } from '@/core/nutritionTone';

const CHIP_TONE: Record<PhaseType, string> = {
  cut: 'bg-phase-cut-soft text-phase-cut-ink border-phase-cut-line',
  bulk: 'bg-phase-bulk-soft text-phase-bulk-ink border-phase-bulk-line',
  maintenance: 'bg-phase-maint-soft text-phase-maint-ink border-phase-maint-line',
};

const ICON_TONE: Record<PhaseType, string> = {
  cut: 'text-phase-cut',
  bulk: 'text-phase-bulk',
  maintenance: 'text-phase-maint',
};

const ICON: Record<PhaseType, typeof Flame> = {
  cut: Flame,
  bulk: TrendingUp,
  maintenance: Minus,
};

interface Props {
  phase: PhaseType;
  className?: string;
}

/** Phase-tinted chip. Shared: the planner header, plus the Plantillas and Objetivos waves. */
export function PhaseChip({ phase, className }: Props) {
  const { t } = useTranslation('objetivos');
  const Icon = ICON[phase];
  return (
    <span
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-medium',
        CHIP_TONE[phase],
        className,
      )}
    >
      <Icon className={cn('h-3 w-3', ICON_TONE[phase])} aria-hidden="true" />
      {t(`phases.type.${phase}`)}
    </span>
  );
}
```

```tsx
// src/features/planning/components/WeekStrip.tsx
import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { classify, type PhaseType, type Tone } from '@/core/nutritionTone';
import { formatDate, type Locale } from '@/lib/dates';

const BG_TONE: Record<Tone, string> = {
  good: 'bg-tone-good',
  onTarget: 'bg-tone-good',
  slightOver: 'bg-tone-warn',
  low: 'bg-tone-warn',
  over: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
};

export interface WeekStripDay {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  kcal: number;
  isToday: boolean;
}

interface Props {
  days: WeekStripDay[];
  /** Phase kcal target — omit and every day renders neutral. */
  target?: number;
  phase?: PhaseType;
  className?: string;
}

/**
 * Mobile 7-day strip (canvas `PlanificadorMobileV2`): a tone stripe per day over
 * the weekday letter + number. Display-only — the list below always shows today.
 * Column widths and gap match `WeeklyKcalChart` so each day sits over its bar.
 */
export function WeekStrip({ days, target, phase, className }: Props) {
  const { i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  return (
    <div className={cn('grid grid-cols-7 gap-1.5', className)}>
      {days.map((d) => {
        const tone = classify('kcal', d.kcal, target, phase).tone;
        return (
          <div
            key={d.date}
            data-day={d.date}
            className={cn(
              'relative flex flex-col items-center gap-px overflow-hidden rounded-lg border px-0.5 pb-[5px] pt-1',
              d.isToday
                ? 'border-accent-line bg-accent-soft'
                : 'border-transparent bg-muted',
            )}
          >
            <span
              data-stripe
              aria-hidden="true"
              className={cn('absolute inset-x-0 top-0 h-[3px]', BG_TONE[tone])}
            />
            <span
              className={cn(
                'mt-0.5 text-[8px] font-medium uppercase tracking-[0.02em]',
                d.isToday ? 'text-accent-ink' : 'text-text-dim',
              )}
            >
              {formatDate(parseISO(d.date), 'EEE', locale)}
            </span>
            <span
              className={cn(
                'tnum text-[12.5px] font-semibold',
                d.isToday ? 'text-accent-ink' : 'text-foreground',
              )}
            >
              {formatDate(parseISO(d.date), 'd', locale)}
            </span>
            <span
              aria-hidden="true"
              className={cn('h-1 w-1 rounded-full opacity-80', BG_TONE[tone])}
            />
          </div>
        );
      })}
    </div>
  );
}
```

```tsx
// src/features/planning/components/WeekSummaryCard.tsx
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { WeeklyKcalChart, type WeeklyKcalDay } from '@/features/diario/components/WeeklyKcalChart';
import { weekAverages } from '@/features/planning/weekSummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { classify, type PhaseType, type Tone } from '@/core/nutritionTone';

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface Props {
  days: WeeklyKcalDay[];
  targets?: Macros;
  phase?: PhaseType;
  className?: string;
}

/**
 * Mobile week summary: the "Media diaria" hero + per-day delta over the reused
 * `WeeklyKcalChart` (rendered headerless — this card supplies the heading).
 */
export function WeekSummaryCard({ days, targets, phase, className }: Props) {
  const { t } = useTranslation('planning');
  const dayTotals: Macros[] = days.map((d) => ({ ...ZERO_MACROS, kcal: d.kcal }));
  const { avgKcal, kcalDelta } = weekAverages(dayTotals, targets);
  const tone = classify('kcal', avgKcal, targets?.kcal, phase).tone;

  return (
    <div className={cn('rounded-md border bg-card p-3.5', className)}>
      <div className="flex items-end gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {t('planner.avgDaily')}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="tnum text-[23px] font-semibold tracking-[-0.02em]">{avgKcal}</span>
            <span className="text-[11px] text-text-dim">kcal</span>
          </div>
        </div>
        {targets && kcalDelta != null && (
          <div className="ml-auto text-right">
            <div className="tnum text-[10px] text-text-dim">
              {t('planner.targetShort', { n: Math.round(targets.kcal) })}
            </div>
            <div className={cn('tnum text-[12.5px] font-semibold', TEXT_TONE[tone])}>
              {t('planner.kcalPerDay', { n: kcalDelta >= 0 ? `+${kcalDelta}` : kcalDelta })}
            </div>
          </div>
        )}
      </div>

      <WeeklyKcalChart
        days={days}
        target={targets?.kcal ?? 0}
        phase={phase}
        showHeader={false}
        className="mt-2.5 rounded-none border-0 bg-transparent p-0"
      />
    </div>
  );
}
```

- [ ] **Step 4: Add `showHeader` to WeeklyKcalChart**

In `src/features/diario/components/WeeklyKcalChart.tsx`, add to `Props`:

```ts
  /** The planner embeds this chart inside its own card, which supplies the heading. */
  showHeader?: boolean;
```

destructure it with a default (`showHeader = true`) and wrap the existing header
`<div className="mb-1 flex items-center justify-between">…</div>` in
`{showHeader && ( … )}`. Nothing else changes — the diario callers keep the
header by default.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/components/ui/PhaseChip.test.tsx src/features/planning/components/WeekStrip.test.tsx src/features/planning/components/WeekSummaryCard.test.tsx src/features/diario/components/WeeklyKcalChart.test.tsx`
Expected: PASS — including the untouched diario chart tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/PhaseChip.tsx src/components/ui/PhaseChip.test.tsx src/features/planning/components/WeekStrip.tsx src/features/planning/components/WeekStrip.test.tsx src/features/planning/components/WeekSummaryCard.tsx src/features/planning/components/WeekSummaryCard.test.tsx src/features/diario/components/WeeklyKcalChart.tsx
git commit -m "feat(planner): phase chip, mobile week strip and week summary card"
```

---

## Task 7: TodayPlanList (mobile)

**Files:**
- Create: `src/features/planning/components/TodayPlanList.tsx`
- Test: `src/features/planning/components/TodayPlanList.test.tsx`

**Interfaces:**
- Consumes: `PlannerCellEntry` (Task 4), `mealLabelKey` (Task 1), `add`/`roundMacro`/`ZERO_MACROS` from `@/features/recipes/macros`.
- Produces:
  ```ts
  export interface TodayMeal {
    mealIndex: number;
    mealTime: string | null;
    entries: PlannerCellEntry[];
  }
  ```
  `TodayPlanList({ meals, onAddMeal, onCopyMeal, onOpenEntry, busy, className })` with
  `onAddMeal(mealIndex: number, mealTime: string | null)`, `onCopyMeal(mealIndex: number)`,
  `onOpenEntry(entry: PlannerCellEntry)`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/TodayPlanList.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayPlanList, type TodayMeal } from './TodayPlanList';
import { ZERO_MACROS } from '@/features/recipes/macros';

const meals: TodayMeal[] = [
  {
    mealIndex: 0,
    mealTime: '08:00',
    entries: [
      {
        id: 'e1',
        recipe_id: 'r1',
        recipe_name: 'Avena con plátano',
        servings: 1,
        macros: { ...ZERO_MACROS, kcal: 318, proteinG: 12, carbsG: 55, fatG: 6 },
      },
      {
        id: 'e2',
        recipe_id: 'r2',
        recipe_name: 'Yogur griego',
        servings: 1,
        macros: { ...ZERO_MACROS, kcal: 109, proteinG: 10, carbsG: 5, fatG: 5 },
      },
    ],
  },
  { mealIndex: 1, mealTime: '14:00', entries: [] },
];

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('TodayPlanList', () => {
  it('groups recipes under their meal, with the meal kcal subtotal', () => {
    render(<TodayPlanList meals={meals} onAddMeal={noop} onCopyMeal={noop} onOpenEntry={noop} />);
    expect(screen.getByText('Desayuno')).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('427')).toBeInTheDocument(); // 318 + 109
    expect(screen.getByText('Avena con plátano')).toBeInTheDocument();
  });

  it('shows each recipe macro triad', () => {
    const { container } = render(
      <TodayPlanList meals={meals} onAddMeal={noop} onCopyMeal={noop} onOpenEntry={noop} />,
    );
    const triad = container.querySelector('[data-triad="e1"]');
    expect(triad?.textContent).toContain('12');
    expect(triad?.textContent).toContain('55');
    expect(triad?.textContent).toContain('6');
  });

  it('copies a meal and opens an entry through its callbacks', async () => {
    const onCopyMeal = vi.fn();
    const onOpenEntry = vi.fn();
    render(
      <TodayPlanList meals={meals} onAddMeal={noop} onCopyMeal={onCopyMeal} onOpenEntry={onOpenEntry} />,
    );
    await userEvent.click(screen.getAllByRole('button', { name: /copiar/i })[0]);
    expect(onCopyMeal).toHaveBeenCalledWith(0);

    await userEvent.click(screen.getByText('Avena con plátano'));
    expect(onOpenEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('offers an add affordance for an empty meal and for the day', async () => {
    const onAddMeal = vi.fn();
    render(
      <TodayPlanList meals={meals} onAddMeal={onAddMeal} onCopyMeal={noop} onOpenEntry={noop} />,
    );
    // The day-level "Añadir comida" footer targets the next free meal index.
    await userEvent.click(screen.getByRole('button', { name: /^Añadir comida$/i }));
    expect(onAddMeal).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/planning/components/TodayPlanList.test.tsx`
Expected: FAIL — "Failed to resolve import ./TodayPlanList".

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/planning/components/TodayPlanList.tsx
import { useTranslation } from 'react-i18next';
import { Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mealLabelKey } from '@/features/planning/weekSummary';
import { add, roundMacro, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import type { PlannerCellEntry } from './PlannerMealCell';

export interface TodayMeal {
  mealIndex: number;
  mealTime: string | null;
  entries: PlannerCellEntry[];
}

interface Props {
  meals: TodayMeal[];
  onAddMeal: (mealIndex: number, mealTime: string | null) => void;
  onCopyMeal: (mealIndex: number) => void;
  onOpenEntry: (entry: PlannerCellEntry) => void;
  busy?: boolean;
  className?: string;
}

/** P · C · G triad under a recipe row — macro identity colours, not tone. */
function MacroTriad({ entryId, macros }: { entryId: string; macros: Macros }) {
  const { t } = useTranslation('planning');
  return (
    <div data-triad={entryId} className="tnum mt-0.5 flex items-baseline gap-2 text-[10px]">
      <span className="text-macro-p">
        {roundMacro(macros.proteinG)} <span className="opacity-70">{t('summary.letter.protein')}</span>
      </span>
      <span className="text-macro-c">
        {roundMacro(macros.carbsG)} <span className="opacity-70">{t('summary.letter.carbs')}</span>
      </span>
      <span className="text-macro-g">
        {roundMacro(macros.fatG)} <span className="opacity-70">{t('summary.letter.fat')}</span>
      </span>
    </div>
  );
}

/**
 * Today's planned meals (canvas `PlanificadorMobileV2`): one block per meal —
 * name, time, kcal subtotal, copy affordance — then a row per planned recipe.
 * Empty meals keep their header so the day's shape stays visible.
 */
export function TodayPlanList({
  meals,
  onAddMeal,
  onCopyMeal,
  onOpenEntry,
  busy,
  className,
}: Props) {
  const { t } = useTranslation('planning');
  const nextFreeMeal = meals.find((m) => m.entries.length === 0) ?? meals[meals.length - 1];

  function mealLabel(mealIndex: number): string {
    const { key, params } = mealLabelKey(mealIndex);
    return t(key, params ?? {});
  }

  return (
    <div className={cn('overflow-hidden rounded-md border bg-card', className)}>
      {meals.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">{t('planner.noPlanToday')}</p>
      )}

      {meals.map((meal, i) => {
        const total = meal.entries.reduce<Macros>((acc, e) => add(acc, e.macros), ZERO_MACROS);
        return (
          <div key={`${meal.mealIndex}-${meal.mealTime ?? ''}`} className={cn(i > 0 && 'border-t')}>
            <div className="flex items-center gap-1.5 px-3.5 pt-2.5">
              <span className="text-[10px] font-semibold text-muted-foreground">
                {mealLabel(meal.mealIndex)}
              </span>
              {meal.mealTime && (
                <span className="tnum text-[9.5px] text-text-dim">{meal.mealTime.slice(0, 5)}</span>
              )}
              <span className="tnum ml-auto text-[13px] font-semibold">
                {roundMacro(total.kcal)}
              </span>
              {meal.entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => onCopyMeal(meal.mealIndex)}
                  aria-label={t('slot.copy')}
                  title={t('slot.copy')}
                  disabled={busy}
                  className="grid h-6 w-6 place-items-center rounded-md border text-text-dim"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
            </div>

            {meal.entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpenEntry(e)}
                className="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">
                    {e.recipe_name}
                    {e.servings !== 1 && (
                      <span className="tnum ml-1 text-[11px] text-text-dim">×{e.servings}</span>
                    )}
                  </div>
                  <MacroTriad entryId={e.id} macros={e.macros} />
                </div>
                <span className="tnum text-[11.5px] text-muted-foreground">
                  {roundMacro(e.macros.kcal)}
                </span>
              </button>
            ))}

            {meal.entries.length === 0 && (
              <button
                type="button"
                onClick={() => onAddMeal(meal.mealIndex, meal.mealTime)}
                disabled={busy}
                className="flex w-full items-center gap-1.5 px-3.5 pb-2.5 pt-1 text-[11.5px] text-text-dim"
              >
                <Plus className="h-3 w-3" />
                {t('cell.addFirst')}
              </button>
            )}
          </div>
        );
      })}

      {meals.length > 0 && (
        <button
          type="button"
          onClick={() => onAddMeal(nextFreeMeal.mealIndex, nextFreeMeal.mealTime)}
          disabled={busy}
          className="flex w-full items-center gap-2 border-t px-3.5 py-2.5 text-[12.5px] font-semibold text-accent-ink"
        >
          <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-accent-soft">
            <Plus className="h-3 w-3 text-accent" />
          </span>
          {t('planner.addMeal')}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/planning/components/TodayPlanList.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/TodayPlanList.tsx src/features/planning/components/TodayPlanList.test.tsx
git commit -m "feat(planner): mobile today plan list"
```

---

## Task 8: PlanificadorPage integration

**Files:**
- Modify: `src/components/layout/PageShell.tsx` (add optional `meta?: ReactNode`)
- Modify: `src/pages/PlanificadorPage.tsx` (rewrite the composition)
- Test: `src/pages/PlanificadorPage.test.tsx` *(new)*

**Interfaces:**
- Consumes: everything from Tasks 1–7, plus the untouched `useActiveWeek`,
  `useAddWeekSlot`, `useUpdateWeekSlot`, `useDeleteWeekSlot`, `useCopyWeekMeal`,
  `useApplyTemplateToWeek`, `useSaveWeekAsTemplate`, `useDailyTarget`,
  `ApplyTemplateDialog`, `SaveAsTemplateDialog`, `ShoppingListDialog`,
  `CopyMealDialog`.
- Produces: `PageHeaderV2`/`PageShell` gain `meta?: ReactNode` — rendered after
  the title/subtitle and **before** the `flex-1` spacer, so `actions` stays hard right.

- [ ] **Step 1: Add the `meta` slot to PageShell**

In `src/components/layout/PageShell.tsx`, extend `PageHeaderV2Props`:

```tsx
interface PageHeaderV2Props {
  title: string;
  subtitle?: string;
  /** Inline header content between the title and the actions (e.g. the planner's week label + phase chip + week metrics). */
  meta?: ReactNode;
  actions?: ReactNode;
}
```

and render it inside `PageHeaderV2`, between the subtitle and the spacer:

```tsx
export function PageHeaderV2({ title, subtitle, meta, actions }: PageHeaderV2Props) {
  return (
    <header className="hidden h-14 shrink-0 items-center gap-3.5 border-b bg-card px-6 md:flex">
      <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h1>
      {subtitle && <span className="tnum text-[13.5px] text-text-dim">{subtitle}</span>}
      {meta}
      <div className="flex-1" />
      {actions}
    </header>
  );
}
```

`PageShellProps` already extends `PageHeaderV2Props`, so pass `meta` through to
`PageHeaderV2` in `PageShell`'s body alongside `title`/`subtitle`/`actions`.
Mobile is unaffected — `MobileTopBar` has no `meta` (and no `actions`) by design.

- [ ] **Step 2: Write the failing page test**

```tsx
// src/pages/PlanificadorPage.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanificadorPage } from './PlanificadorPage';
import { ZERO_MACROS } from '@/features/recipes/macros';
import type { ActiveWeek } from '@/features/planner/api';

// Freeze "today" so the week is deterministic: Tue 2026-05-26 (week of Mon 05-25).
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-05-26T09:00:00'));

const week: ActiveWeek = {
  id: 'w1',
  week_start: '2026-05-25',
  source_template_id: null,
  source_template_name: null,
  has_diverged: false,
  meal_times: ['08:00', '14:00'],
  slots: [
    {
      id: 's1',
      date: '2026-05-26',
      meal_index: 0,
      meal_time: '08:00',
      recipe_id: 'r1',
      recipe_name: 'Avena con plátano',
      servings: 1,
      display_order: 0,
      macros: { ...ZERO_MACROS, kcal: 318, proteinG: 12, carbsG: 55, fatG: 6 },
    },
  ],
};

const noopMutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/features/planner/hooks', () => ({
  useActiveWeek: () => ({ data: week, isLoading: false }),
  useAddWeekSlot: () => noopMutation,
  useUpdateWeekSlot: () => noopMutation,
  useDeleteWeekSlot: () => noopMutation,
  useCopyWeekMeal: () => noopMutation,
  useApplyTemplateToWeek: () => noopMutation,
  useSaveWeekAsTemplate: () => noopMutation,
  useWeekShopping: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/templates/hooks', () => ({
  useTemplates: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/planning/useDailyTarget', () => ({
  useDailyTarget: () => ({
    targets: { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 },
    phaseType: 'cut',
    proteinBasis: 'lean',
    weightKg: 80,
  }),
}));

vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlanificadorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('PlanificadorPage', () => {
  it('renders the page title (twice — PageShell mounts both headers by design)', () => {
    renderPage();
    expect(screen.getAllByText('Planificador').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the web grid and the mobile stack together (CSS picks one)', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-day-header]').length).toBe(7); // grid
    expect(container.querySelectorAll('[data-day]').length).toBe(7); // mobile week strip
  });

  it('shows the planned recipe and the phase chip', () => {
    renderPage();
    expect(screen.getAllByText('Avena con plátano').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Corte').length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the shopping-list and template actions', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: /lista de la compra/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /guardar como plantilla/i }).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/pages/PlanificadorPage.test.tsx`
Expected: FAIL — no `[data-day-header]` / no `[data-day]` (the page still renders the old grid).

- [ ] **Step 4: Rewrite PlanificadorPage**

```tsx
// src/pages/PlanificadorPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { ArrowLeftRight, FileBox, Save, ShoppingCart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/layout/PageShell';
import { PhaseChip } from '@/components/ui/PhaseChip';
import { ApplyTemplateDialog } from '@/features/planning/components/ApplyTemplateDialog';
import { CopyMealDialog, type CopyTarget } from '@/features/planning/components/CopyMealDialog';
import { SaveAsTemplateDialog } from '@/features/planning/components/SaveAsTemplateDialog';
import { ShoppingListDialog } from '@/features/planning/components/ShoppingListDialog';
import { WeekGrid } from '@/features/planning/components/WeekGrid';
import { WeekStrip } from '@/features/planning/components/WeekStrip';
import { WeekSummaryCard } from '@/features/planning/components/WeekSummaryCard';
import { TodayPlanList, type TodayMeal } from '@/features/planning/components/TodayPlanList';
import { weekMealTargets } from '@/features/planning/copyTargets';
import { isoWeekNumber, weekAverages } from '@/features/planning/weekSummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import {
  useActiveWeek,
  useAddWeekSlot,
  useApplyTemplateToWeek,
  useCopyWeekMeal,
  useDeleteWeekSlot,
  useSaveWeekAsTemplate,
  useUpdateWeekSlot,
} from '@/features/planner/hooks';
import { useTemplates } from '@/features/templates/hooks';
import { useDailyTarget } from '@/features/planning/useDailyTarget';
import { roundMacro, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, isoDate, mondayOf, type Locale } from '@/lib/dates';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PlanificadorPage() {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const today = isoDate();
  const weekStart = formatDate(mondayOf(new Date()), 'yyyy-MM-dd', locale);

  const { targets, phaseType, weightKg } = useDailyTarget();

  const week = useActiveWeek(weekStart);
  const templates = useTemplates();
  const apply = useApplyTemplateToWeek();
  const saveAs = useSaveWeekAsTemplate();
  const addSlot = useAddWeekSlot();
  const updateSlot = useUpdateWeekSlot();
  const deleteSlot = useDeleteWeekSlot();

  const [applyOpen, setApplyOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);

  const copyMeal = useCopyWeekMeal();
  const [copySource, setCopySource] = useState<{ date: string; mealIndex: number } | null>(null);

  // Mobile add/edit goes through the existing RecipePickerDialog until PR-B's
  // add drawer + recipe peek replace it. Without this the mobile list would have
  // no way to add a meal — the web grid's cell picker is desktop-only.
  const [mobilePick, setMobilePick] = useState<{
    mealIndex: number;
    mealTime: string | null;
    entry: PlannerCellEntry | null;
  } | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    formatDate(addDays(parseISO(weekStart), i), 'yyyy-MM-dd', locale),
  );

  const slots = week.data?.slots ?? [];
  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));
  const perDay: Macros[] = weekDates.map((d) => dayTotals.get(d) ?? ZERO_MACROS);
  const { avgKcal, avgProteinG, proteinPct } = weekAverages(perDay, targets);

  const chartDays = weekDates.map((d) => ({
    date: d,
    kcal: (dayTotals.get(d) ?? ZERO_MACROS).kcal,
    isToday: d === today,
  }));

  const todayTotals = dayTotals.get(today) ?? ZERO_MACROS;

  // Mobile "today" list: one block per configured meal time, plus any orphan
  // meal_index the week diverged into — same row model as WeekGrid.
  const mealTimes = week.data?.meal_times ?? [];
  const todaySlots = slots.filter((s) => s.date === today);
  const todayMeals: TodayMeal[] = [
    ...mealTimes.map((time, i) => ({ mealIndex: i, mealTime: time })),
    ...Array.from(
      new Map(
        todaySlots
          .filter((s) => s.meal_index >= mealTimes.length)
          .map((s) => [s.meal_index, { mealIndex: s.meal_index, mealTime: s.meal_time }]),
      ).values(),
    ).sort((a, b) => a.mealIndex - b.mealIndex),
  ].map((row) => ({
    ...row,
    entries: todaySlots
      .filter((s) => s.meal_index === row.mealIndex)
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => ({
        id: s.id,
        recipe_id: s.recipe_id,
        recipe_name: s.recipe_name,
        servings: s.servings,
        macros: s.macros,
      })),
  }));

  const copyTargets: CopyTarget[] = copySource
    ? weekMealTargets(slots, weekDates, copySource.date, copySource.mealIndex).map((tg) => ({
        key: tg.key,
        label: capitalize(formatDate(parseISO(tg.key), 'EEEE', locale)),
        sublabel: formatDate(parseISO(tg.key), 'd MMM', locale),
        willOverwrite: tg.willOverwrite,
      }))
    : [];

  const copyEntries = copySource
    ? slots.filter((s) => s.date === copySource.date && s.meal_index === copySource.mealIndex)
    : [];

  const copySourceLabel = copySource
    ? `${copyEntries[0]?.meal_time?.slice(0, 5) ?? ''} · ${capitalize(formatDate(parseISO(copySource.date), 'EEEE', locale))}`.trim()
    : '';

  async function handleApply(templateId: string) {
    await apply.mutateAsync({ templateId, targetDate: today });
  }

  async function handleSaveAs(name: string) {
    if (!week.data) return;
    await saveAs.mutateAsync({ weekId: week.data.id, name });
  }

  async function handleAdd(
    date: string,
    mealIndex: number,
    mealTime: string | null,
    recipe: { id: string; name: string },
    servings: number,
  ) {
    if (!week.data) return;
    const sameSlot = week.data.slots.filter(
      (s) =>
        s.date === date &&
        s.meal_index === mealIndex &&
        (s.meal_time ?? '') === (mealTime ?? ''),
    );
    await addSlot.mutateAsync({
      plan_week_id: week.data.id,
      date,
      meal_index: mealIndex,
      meal_time: mealTime,
      recipe_id: recipe.id,
      servings,
      display_order: sameSlot.length,
    });
  }

  const hasTemplates = (templates.data ?? []).length > 0;
  const isEmpty = !week.isLoading && (!week.data || week.data.slots.length === 0);

  const busy =
    apply.isPending ||
    addSlot.isPending ||
    updateSlot.isPending ||
    deleteSlot.isPending ||
    saveAs.isPending;

  const weekLabel = t('planner.weekLabel', {
    week: isoWeekNumber(weekStart),
    from: formatDate(parseISO(weekStart), 'd MMM', locale),
    to: formatDate(addDays(parseISO(weekStart), 6), 'd MMM', locale),
  });

  // Desktop header meta: week label + phase chip + the two week metrics.
  const headerMeta = (
    <div className="flex items-center gap-3.5">
      <span className="h-5 w-px bg-border" aria-hidden="true" />
      <span className="tnum text-[13.5px] font-medium">{weekLabel}</span>
      {phaseType && <PhaseChip phase={phaseType} />}
      {targets && (
        <>
          <span className="h-5 w-px bg-border" aria-hidden="true" />
          <span className="flex items-baseline gap-1.5 text-[12.5px]">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
              {t('planner.avgKcal')}
            </span>
            <span className="tnum font-semibold">{avgKcal}</span>
            <span className="tnum text-[11.5px] text-text-dim">
              / {roundMacro(targets.kcal)} kcal
            </span>
          </span>
          <span className="flex items-baseline gap-1.5 text-[12.5px]">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
              {t('planner.proteinAvg')}
            </span>
            <span className="tnum font-semibold">{avgProteinG} g</span>
            {proteinPct != null && (
              <span className="tnum text-[11.5px] text-text-dim">
                {t('planner.proteinPct', { pct: proteinPct })}
              </span>
            )}
          </span>
        </>
      )}
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <Link to="/templates">
          <FileBox className="h-4 w-4" />
          {t('planner.manageTemplates')}
        </Link>
      </Button>
      <Button
        variant="outline"
        onClick={() => setApplyOpen(true)}
        disabled={!hasTemplates}
        title={!hasTemplates ? t('planner.needTemplate') : undefined}
      >
        <ArrowLeftRight className="h-4 w-4" />
        {week.data?.source_template_id ? t('planner.swapTemplate') : t('planner.applyTemplate')}
      </Button>
      <Button
        variant="outline"
        onClick={() => setSaveOpen(true)}
        disabled={!week.data || week.data.slots.length === 0}
      >
        <Save className="h-4 w-4" />
        {t('planner.saveAsTemplate')}
      </Button>
      <Button
        onClick={() => setShoppingOpen(true)}
        disabled={!week.data || week.data.slots.length === 0}
      >
        <ShoppingCart className="h-4 w-4" />
        {t('shopping.open')}
      </Button>
    </div>
  );

  return (
    <PageShell title={t('planner.pageTitle')} meta={headerMeta} actions={headerActions}>
      <div className="space-y-4">
        {/* Mobile header block: week label + phase chip (the desktop header carries these). */}
        <div className="flex items-center gap-2 md:hidden">
          <span className="tnum text-[11.5px] text-text-dim">{weekLabel}</span>
          {phaseType && <PhaseChip phase={phaseType} className="ml-auto" />}
        </div>

        {week.data?.source_template_name && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{t('planner.basedOn', { name: week.data.source_template_name })}</span>
            {week.data.has_diverged && (
              <Badge variant="warning" className="gap-1">
                <Sparkles className="h-3 w-3" />
                {t('planner.diverged')}
              </Badge>
            )}
          </div>
        )}

        {week.isLoading ? (
          <Card>
            <CardContent className="space-y-3 py-6">
              <Skeleton className="h-6 w-40" />
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 21 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : isEmpty ? (
          <Card>
            <CardContent className="space-y-3 py-10 text-center">
              <FileBox className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">
                {hasTemplates ? t('planner.empty.hasTemplates') : t('planner.empty.noTemplates')}
              </p>
              {hasTemplates ? (
                <Button onClick={() => setApplyOpen(true)}>{t('planner.empty.applyCta')}</Button>
              ) : (
                <Button asChild>
                  <Link to="/templates/new">{t('planner.empty.createCta')}</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          week.data && (
            <>
              {/* Mobile: strip + summary chart + today's plan. */}
              <div className="space-y-3 md:hidden">
                <WeekStrip days={chartDays} target={targets?.kcal} phase={phaseType} />
                <WeekSummaryCard days={chartDays} targets={targets} phase={phaseType} />

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                    {t('planner.todayHeading', {
                      date: capitalize(formatDate(parseISO(today), 'EEE d', locale)),
                    })}
                  </span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  {targets && (
                    <span className="tnum text-[11px] text-text-dim">
                      {t('planner.todayKcal', {
                        consumed: roundMacro(todayTotals.kcal),
                        target: roundMacro(targets.kcal),
                      })}
                    </span>
                  )}
                </div>

                <TodayPlanList
                  meals={todayMeals}
                  busy={busy}
                  onAddMeal={(mealIndex, mealTime) =>
                    setMobilePick({ mealIndex, mealTime, entry: null })
                  }
                  onCopyMeal={(mealIndex) => setCopySource({ date: today, mealIndex })}
                  onOpenEntry={(entry) => {
                    const row = todayMeals.find((m) => m.entries.some((e) => e.id === entry.id));
                    setMobilePick({
                      mealIndex: row?.mealIndex ?? 0,
                      mealTime: row?.mealTime ?? null,
                      entry,
                    });
                  }}
                />

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSaveOpen(true)}
                  disabled={slots.length === 0}
                >
                  <Save className="h-4 w-4" />
                  {t('planner.saveAsTemplate')}
                </Button>
              </div>

              {/* Web: the full week grid. */}
              <div className="hidden md:block">
                <WeekGrid
                  weekStart={week.data.week_start}
                  slots={week.data.slots}
                  mealTimes={week.data.meal_times}
                  todayIso={today}
                  busy={busy}
                  targets={targets}
                  phaseType={phaseType}
                  weightKg={weightKg}
                  onAdd={handleAdd}
                  onUpdate={async (slotId, recipe, servings) => {
                    await updateSlot.mutateAsync({
                      id: slotId,
                      patch: { recipe_id: recipe.id, servings },
                    });
                  }}
                  onRemove={async (slotId) => {
                    await deleteSlot.mutateAsync(slotId);
                  }}
                  onCopyMeal={(date, mealIndex) => setCopySource({ date, mealIndex })}
                />
              </div>
            </>
          )
        )}

        <ApplyTemplateDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          targetDate={today}
          onApply={handleApply}
          busy={apply.isPending}
        />
        <SaveAsTemplateDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          weekStart={weekStart}
          onSave={handleSaveAs}
          busy={saveAs.isPending}
        />
        <ShoppingListDialog open={shoppingOpen} onOpenChange={setShoppingOpen} weekStart={weekStart} />
        <RecipePickerDialog
          open={!!mobilePick}
          onOpenChange={(o) => !o && setMobilePick(null)}
          initialRecipe={
            mobilePick?.entry
              ? {
                  id: mobilePick.entry.recipe_id,
                  name: mobilePick.entry.recipe_name,
                  servings: mobilePick.entry.servings,
                }
              : null
          }
          busy={busy}
          onSave={async (recipeId, recipeName, servings) => {
            if (!mobilePick) return;
            if (mobilePick.entry) {
              await updateSlot.mutateAsync({
                id: mobilePick.entry.id,
                patch: { recipe_id: recipeId, servings },
              });
            } else {
              await handleAdd(
                today,
                mobilePick.mealIndex,
                mobilePick.mealTime,
                { id: recipeId, name: recipeName },
                servings,
              );
            }
          }}
          onDelete={
            mobilePick?.entry
              ? async () => {
                  await deleteSlot.mutateAsync(mobilePick.entry!.id);
                  setMobilePick(null);
                }
              : undefined
          }
        />
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
      </div>
    </PageShell>
  );
}
```

**Imports to add** in `PlanificadorPage.tsx`: `RecipePickerDialog` from
`@/features/planning/components/RecipePickerDialog` and the `PlannerCellEntry`
type from `@/features/planning/components/PlannerMealCell`.

**Why the page mounts `RecipePickerDialog`:** PR-B replaces the planner's add
and peek surfaces with the drawer and the docked recipe panel, but `develop`
must stay functional in between. Without this dialog the mobile list would have
no way to add or edit a meal at all (the grid's cell picker is desktop-only).
Reuse the existing dialog verbatim — do not build an interim mobile drawer.

- [ ] **Step 5: Run the page test**

Run: `pnpm vitest run src/pages/PlanificadorPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Full verification**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: all green. Confirm `src/components/layout/PageShell.test.tsx` (wave 0)
and every diario test still pass — `meta` is additive and `showHeader` defaults
to the old behaviour.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/PageShell.tsx src/pages/PlanificadorPage.tsx src/pages/PlanificadorPage.test.tsx
git commit -m "feat(planner): responsive planificador page on the new week views"
```

---

## PR-A wrap-up (before opening the PR)

- [ ] `pnpm lint && pnpm build && pnpm test` green from the worktree root, and
      `git status` clean. Do not trust a subagent's green report — run it yourself
      (memory: `verify-full-suite-after-subagents`).
- [ ] Hardcoded-colour grep gate: no hex literals and no `bg-<tailwind-palette>-<n>`
      classes in the new files.
- [ ] Visual QA per spec §7 at 390px and 1300px (agent-browser + the seeded QA
      user): day-header tones, today outline, dashed empty cells, mobile strip
      alignment over the chart bars, phase chip.
- [ ] Open the PR to `develop`, squash-auto-merge once CI is green.

---

## PR-B — Planificador flows (outline)

Detailed steps get written once PR-A merges; the shape is fixed:

**B1 — `ResponsiveDialog` extraction.** Pull the vaul-`Drawer`-on-mobile /
`Dialog`-on-desktop branch out of `AddToDaySheet` (and `ExerciseInfoButton`)
into one shared component. This was already flagged as a wave-2 follow-up; the
add drawer and the recipe peek both need it, so it pays for itself here.

**B2 — Add-recipe drawer (V1, live balance).** Replaces `RecipePickerDialog` in
the planner: destino chip (day · meal · time), search + filter chips,
recipes-only result list (the planner cannot hold loose ingredients —
`recipe_id` is `NOT NULL`), and a live day-balance footer built on the existing
`MacroProjBar` (fixed 76% target line, striped overflow) with the projected
kcal/P/C/G for the day the recipe would land on. Wires the mobile
`TodayPlanList.onAddMeal` and the grid cells' add affordances. Fit-scored
suggestions (canvas V2) stay stripped.

**B3 — Copy-meal popover + append mode.** Restyle `CopyMealDialog` into the
canvas's 7-day multiselect grid with a "Reemplazar / Añadir junto" segmented
toggle and the dynamic summary line. **Replace** keeps calling the existing
`copy_week_meal` RPC. **Append** is new and client-side: one
`supabase.from('meal_plan_week_slots').insert([...])` of the source meal's rows
re-dated to each target, with `display_order` continuing after whatever already
occupies that (date, meal_index) — a single-table, single-statement insert, so
no RPC and no migration (hard invariant 3 does not bite). New pure helper +
Tier-1 test for the row projection, `appendWeekMeal()` in `planner/api.ts`,
`useAppendWeekMeal()` in `planner/hooks.ts`.

**B4 — Recipe peek (docked drawer).** Tapping a recipe bullet (grid) or row
(mobile list) opens the recipe: meta chips, per-serving macros, ingredient list,
instructions, and an "Abrir receta" link to `/recipes/:id`. Reuses the existing
recipe-detail query — **no new `.select()`**. The canvas's docked variant keeps
the plan visible behind it on web; mobile gets the bottom sheet.

**B5 — Visual QA + i18n sweep**, then PR to `develop`.

## Self-review notes

- **Spec coverage (§6 wave 3):** V2 mobile week strip + kcal bars vs dashed
  target → Task 6; enriched today list + per-meal copy → Task 7; web weekly grid
  with V4 day headers, recipe bullets, copy button, inline añadir, kcal/P/C/G
  footer, dashed empty state → Tasks 2–5; copy-meal popover (replace/append) →
  PR-B/B3; "Añadir receta" drawer V1 with live day-balance footer → PR-B/B2;
  recipe peek as docked drawer → PR-B/B4. Strip-list decisions are tabled above.
- **Meal times** are kept (schema carries them) and **"comida libre"** is
  stripped (`recipe_id NOT NULL`) — both spec "verify" items, now answered.
- **Adaptation policy:** meal *names* don't exist in the schema, so they are
  positional (`mealLabelKey`) — the canvas's own model. Worth a `D-F` decision
  entry at the wave's doc-reconcile.
