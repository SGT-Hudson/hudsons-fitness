# Daily-loop Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the everyday Diario + Progreso loop in three sequenced, no-schema PRs: a semantically-correct targets card, one-tap recent/frequent logging, and a smoothed-trend Progreso.

**Architecture:** Three independent React/TS feature changes, presentational/derived only — no migration, RPC, or edge change. Each ships a pure, Vitest-covered logic module (`targetStatus.ts`, `quickAdd.ts`, `trend.ts`) plus thin UI wiring. Phases 1 → 2 → 3 are ordered because Phases 1 and 2 both edit `DiarioPage`.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Recharts, react-i18next, Tailwind/shadcn, Vitest (+ RTL/jsdom for `*.test.tsx`), Supabase JS.

**Source spec:** `docs/superpowers/specs/2026-05-18-daily-loop-polish-design.md`

**Branching & checkpoints:** The spec + this plan are committed on `claude/daily-loop-polish-spec` — open that as a small docs PR. Each phase below is then its own short-lived branch off the latest `main` → PR → CI (`pnpm lint` + `pnpm build` + `pnpm test`) green → review checkpoint → merge, before the next phase branches. After each phase merges, update the matching `docs/features.md` section (invariant #7 — never before).

**Conventions verified in-repo:**
- Tier-1 pure tests are `*.test.ts` (Node); Tier-2 component tests are `*.test.tsx` (jsdom via `environmentMatchGlobs`). Both run under `pnpm test`.
- Single-file test run: `pnpm exec vitest run <path>`.
- Toasts: `toast()` from `@/hooks/use-toast`; helpers in `@/lib/toast-helpers`; `toaster.tsx` already renders a toast `action` element. There is **no** `ToastAction` styled component yet — Phase 2 adds the shadcn-standard one.
- `createMealLog()` already returns the inserted row (`.select('*').single()`).
- Macros type + `roundMacro` from `@/features/recipes/macros`; `computeMealLogMacros`/`sumMacros` from `@/features/diario/macros`.
- `PhaseType`/`computeTargetWeightKg`/`estimatedBmr` from `@/lib/macros`; `useActivePhase`, `useGoal`, `useProfile`, `useSmoothedMeasurements`, `useRecentMeasurements` exist.

---

# Phase 1 — Targets view (B1)

**Branch:** `claude/daily-loop-1-targets-view` off `main`.

**Files:**
- Create: `src/features/diario/targetStatus.ts`
- Test: `src/features/diario/targetStatus.test.ts`
- Modify (full rewrite): `src/features/diario/components/DayTotalsCard.tsx`
- Test: `src/features/diario/components/DayTotalsCard.test.tsx`
- Modify: `src/pages/DiarioPage.tsx` (pass `phaseType` prop)
- Modify: `src/i18n/es/diario.json`, `src/i18n/en/diario.json` (add `totals.*` keys)

### Task 1.1: Pure macro classifier

- [ ] **Step 1: Write the failing test**

Create `src/features/diario/targetStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyMacro, KCAL_MAINTENANCE_BAND_PCT } from './targetStatus';

describe('classifyMacro', () => {
  it('no target → flex', () => {
    expect(classifyMacro('kcal', 500, undefined, 'cut')).toEqual({
      remaining: 0,
      fillPct: 0,
      tone: 'flex',
    });
  });

  it('cut kcal under target → budget', () => {
    const s = classifyMacro('kcal', 1180, 2000, 'cut');
    expect(s.tone).toBe('budget');
    expect(s.remaining).toBe(820);
    expect(s.fillPct).toBeCloseTo(59, 0);
  });

  it('cut kcal over target → overBudget', () => {
    expect(classifyMacro('kcal', 2200, 2000, 'cut').tone).toBe('overBudget');
  });

  it('bulk kcal under target → budget (to-go)', () => {
    expect(classifyMacro('kcal', 1800, 2600, 'bulk').tone).toBe('budget');
  });

  it('bulk kcal at/over target → floorMet', () => {
    expect(classifyMacro('kcal', 2600, 2600, 'bulk').tone).toBe('floorMet');
  });

  it('maintenance kcal within band → floorMet', () => {
    expect(classifyMacro('kcal', 2050, 2000, 'maintenance').tone).toBe('floorMet');
  });

  it('maintenance kcal far over band → overBudget', () => {
    expect(classifyMacro('kcal', 2400, 2000, 'maintenance').tone).toBe('overBudget');
  });

  it('protein over target → floorMet (over-protein is good, never red)', () => {
    const s = classifyMacro('proteinG', 175, 165, 'cut');
    expect(s.tone).toBe('floorMet');
    expect(s.remaining).toBe(-10);
  });

  it('protein under target → floorUnderSoft (neutral, not alarming)', () => {
    expect(classifyMacro('proteinG', 110, 165, 'cut').tone).toBe('floorUnderSoft');
  });

  it('fiber under minimum → floorUnderWarn (amber)', () => {
    expect(classifyMacro('fiberG', 18, 30, 'cut').tone).toBe('floorUnderWarn');
  });

  it('fiber met → floorMet', () => {
    expect(classifyMacro('fiberG', 30, 30, 'cut').tone).toBe('floorMet');
  });

  it('carbs and fat are always flex (informational)', () => {
    expect(classifyMacro('carbsG', 95, 180, 'cut').tone).toBe('flex');
    expect(classifyMacro('fatG', 80, 60, 'cut').tone).toBe('flex');
  });

  it('fillPct clamps to 0..100', () => {
    expect(classifyMacro('proteinG', 300, 100, 'cut').fillPct).toBe(100);
    expect(classifyMacro('kcal', -5, 2000, 'cut').fillPct).toBe(0);
  });

  it('exposes the maintenance band constant', () => {
    expect(KCAL_MAINTENANCE_BAND_PCT).toBe(5);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/features/diario/targetStatus.test.ts`
Expected: FAIL — `Cannot find module './targetStatus'`.

- [ ] **Step 3: Implement the module**

Create `src/features/diario/targetStatus.ts`:

```ts
// Pure, dependency-free macro-status classifier for the Diario targets card
// (Theme 1 / B1). Fixes the prior "over anything = red" bug: protein/fiber
// are floors, kcal is a phase-aware budget/goal, carbs/fat are informational.

export type MacroKey = 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';

export type MacroTone =
  | 'budget' // in budget / to-go (blue)
  | 'overBudget' // over a kcal ceiling (red)
  | 'floorMet' // floor reached: protein/fiber met, bulk kcal reached (green)
  | 'floorUnderSoft' // protein under: just "remaining" (neutral)
  | 'floorUnderWarn' // fiber under a health minimum (amber)
  | 'flex'; // carbs/fat informational, or no target (grey)

export interface MacroStatus {
  /** target - consumed; may be negative when over. */
  remaining: number;
  /** clamp(consumed / target, 0, 1) * 100. */
  fillPct: number;
  tone: MacroTone;
}

/** Maintenance kcal is "on target" within ±this percent of the target. */
export const KCAL_MAINTENANCE_BAND_PCT = 5;

export function classifyMacro(
  key: MacroKey,
  consumed: number,
  target: number | undefined,
  phaseType: PhaseType | undefined,
): MacroStatus {
  if (target == null || target <= 0) {
    return { remaining: 0, fillPct: 0, tone: 'flex' };
  }

  const remaining = target - consumed;
  const fillPct = Math.max(0, Math.min(consumed / target, 1)) * 100;

  let tone: MacroTone;
  if (key === 'kcal') {
    const pt = phaseType ?? 'cut';
    if (pt === 'bulk') {
      tone = consumed >= target ? 'floorMet' : 'budget';
    } else if (pt === 'maintenance') {
      const band = (target * KCAL_MAINTENANCE_BAND_PCT) / 100;
      if (consumed > target + band) tone = 'overBudget';
      else if (consumed < target - band) tone = 'budget';
      else tone = 'floorMet';
    } else {
      // cut
      tone = consumed > target ? 'overBudget' : 'budget';
    }
  } else if (key === 'proteinG') {
    tone = consumed >= target ? 'floorMet' : 'floorUnderSoft';
  } else if (key === 'fiberG') {
    tone = consumed >= target ? 'floorMet' : 'floorUnderWarn';
  } else {
    // carbsG, fatG — informational
    tone = 'flex';
  }

  return { remaining, fillPct, tone };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/features/diario/targetStatus.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/diario/targetStatus.ts src/features/diario/targetStatus.test.ts
git commit -m "feat(diario): pure macro-status classifier (Theme 1 / B1)"
```

### Task 1.2: i18n keys for the targets card

- [ ] **Step 1: Add Spanish keys**

In `src/i18n/es/diario.json`, replace the `"totals"` object with (adds keys, keeps existing ones):

```json
  "totals": {
    "title": "Resumen del día",
    "kcal": "Calorías",
    "protein": "Proteína",
    "carbs": "Carbohidratos",
    "fat": "Grasa",
    "fiber": "Fibra",
    "targetsHint": "Cuando tengas una fase activa, aquí verás los objetivos diarios y la barra de progreso por macro.",
    "proteinBasisLean": "× masa magra",
    "proteinBasisFallback": "1,6 g/kg de peso — añade un % de grasa para un objetivo ajustado a la fase",
    "tdeeConfidenceLow": "TDEE en calentamiento — objetivo aproximado",
    "tdeeConfidenceMedium": "TDEE aún estabilizándose — objetivo aproximado",
    "heroRemaining": "kcal restantes",
    "heroToGoal": "kcal para el objetivo",
    "heroOver": "kcal de más",
    "remainingG": "faltan {{n}} g",
    "overG": "+{{n}} g de más",
    "proteinMet": "✓ cubierto +{{n}} g",
    "fiberBelowMin": "{{n}} g bajo el mínimo",
    "consumedOf": "{{consumed}} / {{target}} consumidas"
  },
```

- [ ] **Step 2: Add English keys**

In `src/i18n/en/diario.json`, replace the `"totals"` object with:

```json
  "totals": {
    "title": "Day summary",
    "kcal": "Calories",
    "protein": "Protein",
    "carbs": "Carbs",
    "fat": "Fat",
    "fiber": "Fiber",
    "targetsHint": "Once you have an active phase, daily targets and per-macro progress bars will show here.",
    "proteinBasisLean": "× lean mass",
    "proteinBasisFallback": "1.6 g/kg bodyweight — add a body-fat % for a phase-tuned target",
    "tdeeConfidenceLow": "TDEE warming up — approximate target",
    "tdeeConfidenceMedium": "TDEE still settling — approximate target",
    "heroRemaining": "kcal left",
    "heroToGoal": "kcal to goal",
    "heroOver": "kcal over",
    "remainingG": "{{n}} g left",
    "overG": "+{{n}} g over",
    "proteinMet": "✓ met +{{n}} g",
    "fiberBelowMin": "{{n}} g below minimum",
    "consumedOf": "{{consumed}} / {{target}} consumed"
  },
```

- [ ] **Step 3: Verify JSON parses**

Run: `pnpm exec tsc --noEmit` (the i18n JSON is imported; a syntax error fails the build).
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/diario.json src/i18n/en/diario.json
git commit -m "i18n(diario): targets-card remaining/hero keys (Theme 1)"
```

### Task 1.3: Rewrite DayTotalsCard (B1 layout + semantics)

- [ ] **Step 1: Write the failing component test**

Create `src/features/diario/components/DayTotalsCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayTotalsCard } from './DayTotalsCard';

const Z = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

describe('DayTotalsCard', () => {
  it('over-protein renders the met (green) class, never destructive', () => {
    const { container } = render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1180, proteinG: 175 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        proteinBasis="lean"
        phaseType="cut"
      />,
    );
    expect(screen.getByText(/cubierto|met/i)).toBeInTheDocument();
    expect(container.querySelector('.bg-destructive')).toBeNull();
  });

  it('cut kcal under target shows the remaining hero, not red', () => {
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1180 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        proteinBasis="lean"
        phaseType="cut"
      />,
    );
    expect(screen.getByText('820')).toBeInTheDocument();
  });

  it('no targets → hint, no hero', () => {
    render(<DayTotalsCard totals={{ ...Z, kcal: 500 }} />);
    expect(screen.getByText(/active phase|fase activa/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run src/features/diario/components/DayTotalsCard.test.tsx`
Expected: FAIL — current `DayTotalsCard` has no `phaseType` prop / no hero `820`.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/features/diario/components/DayTotalsCard.tsx` with:

```tsx
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { roundMacro, type Macros } from '@/features/recipes/macros';
import type { TdeeConfidence } from '@/features/tdee/api';
import {
  classifyMacro,
  type MacroKey,
  type MacroTone,
  type PhaseType,
} from '../targetStatus';

/** Which protein basis the active target was computed on (D-B1). */
export type ProteinBasis = 'lean' | 'fallback';

interface Props {
  totals: Macros;
  targets?: Macros;
  proteinBasis?: ProteinBasis;
  tdeeConfidence?: TdeeConfidence | null;
  /** Active phase type — drives kcal budget vs goal semantics (Theme 1). */
  phaseType?: PhaseType;
}

const TEXT_TONE: Record<MacroTone, string> = {
  budget: 'text-sky-600 dark:text-sky-400',
  overBudget: 'text-destructive',
  floorMet: 'text-emerald-600 dark:text-emerald-400',
  floorUnderSoft: 'text-muted-foreground',
  floorUnderWarn: 'text-amber-600 dark:text-amber-400',
  flex: 'text-muted-foreground',
};

const BAR_TONE: Record<MacroTone, string> = {
  budget: 'bg-sky-600 dark:bg-sky-500',
  overBudget: 'bg-destructive',
  floorMet: 'bg-emerald-600 dark:bg-emerald-500',
  floorUnderSoft: 'bg-muted-foreground/50',
  floorUnderWarn: 'bg-amber-500',
  flex: 'bg-muted-foreground/40',
};

function MacroBlock({
  label,
  macroKey,
  consumed,
  target,
  phaseType,
  note,
}: {
  label: string;
  macroKey: MacroKey;
  consumed: number;
  target?: number;
  phaseType?: PhaseType;
  note?: string;
}) {
  const { t } = useTranslation('diario');
  const s = classifyMacro(macroKey, consumed, target, phaseType);
  const hasTarget = target != null && target > 0;

  let sub: string | null = null;
  if (hasTarget) {
    const n = Math.abs(roundMacro(s.remaining));
    if (macroKey === 'proteinG') {
      sub = s.tone === 'floorMet' ? t('totals.proteinMet', { n }) : t('totals.remainingG', { n });
    } else if (macroKey === 'fiberG') {
      sub = s.tone === 'floorMet' ? t('totals.proteinMet', { n }) : t('totals.fiberBelowMin', { n });
    } else {
      sub = s.remaining >= 0 ? t('totals.remainingG', { n }) : t('totals.overG', { n });
    }
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold tabular-nums leading-tight">
        {roundMacro(consumed)}
        {hasTarget && (
          <span className="text-sm font-normal text-muted-foreground">/{roundMacro(target!)}</span>
        )}
        <span className="text-sm font-normal text-muted-foreground ml-1">g</span>
      </div>
      {note && <div className="text-[11px] text-muted-foreground leading-tight">{note}</div>}
      {hasTarget && (
        <>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', BAR_TONE[s.tone])}
              style={{ width: `${s.fillPct}%` }}
            />
          </div>
          {sub && (
            <div className={cn('text-[11px] leading-tight tabular-nums', TEXT_TONE[s.tone])}>
              {sub}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DayTotalsCard({
  totals,
  targets,
  proteinBasis,
  tdeeConfidence,
  phaseType,
}: Props) {
  const { t } = useTranslation('diario');

  const proteinNote =
    targets && proteinBasis
      ? proteinBasis === 'lean'
        ? t('totals.proteinBasisLean')
        : t('totals.proteinBasisFallback')
      : undefined;

  const showTdeeBadge =
    !!targets && (tdeeConfidence === 'low' || tdeeConfidence === 'medium');

  // kcal hero (phase-aware). Hidden when no target.
  let hero: { value: number; label: string; tone: MacroTone } | null = null;
  if (targets) {
    const k = classifyMacro('kcal', totals.kcal, targets.kcal, phaseType);
    const remaining = roundMacro(k.remaining);
    if (phaseType === 'bulk') {
      hero = { value: Math.max(remaining, 0), label: t('totals.heroToGoal'), tone: k.tone };
    } else if (k.tone === 'overBudget') {
      hero = { value: Math.abs(remaining), label: t('totals.heroOver'), tone: 'overBudget' };
    } else {
      hero = { value: Math.max(remaining, 0), label: t('totals.heroRemaining'), tone: k.tone };
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('totals.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {hero && (
          <div className="text-center pb-4 mb-4 border-b">
            <div
              className={cn(
                'text-4xl font-bold tabular-nums leading-none tracking-tight',
                TEXT_TONE[hero.tone],
              )}
            >
              {hero.value}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-1.5">
              {hero.label}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
              {t('totals.consumedOf', {
                consumed: roundMacro(totals.kcal),
                target: roundMacro(targets!.kcal),
              })}
            </div>
            {showTdeeBadge && (
              <div className="mt-2">
                <Badge variant="warning">
                  {tdeeConfidence === 'low'
                    ? t('totals.tdeeConfidenceLow')
                    : t('totals.tdeeConfidenceMedium')}
                </Badge>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <MacroBlock
            label={t('totals.protein')}
            macroKey="proteinG"
            consumed={totals.proteinG}
            target={targets?.proteinG}
            phaseType={phaseType}
            note={proteinNote}
          />
          <MacroBlock
            label={t('totals.carbs')}
            macroKey="carbsG"
            consumed={totals.carbsG}
            target={targets?.carbsG}
            phaseType={phaseType}
          />
          <MacroBlock
            label={t('totals.fat')}
            macroKey="fatG"
            consumed={totals.fatG}
            target={targets?.fatG}
            phaseType={phaseType}
          />
          <MacroBlock
            label={t('totals.fiber')}
            macroKey="fiberG"
            consumed={totals.fiberG}
            target={targets?.fiberG}
            phaseType={phaseType}
          />
        </div>

        {!targets && (
          <p className="mt-4 text-xs text-muted-foreground">{t('totals.targetsHint')}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the component test, verify it passes**

Run: `pnpm exec vitest run src/features/diario/components/DayTotalsCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/diario/components/DayTotalsCard.tsx src/features/diario/components/DayTotalsCard.test.tsx
git commit -m "feat(diario): B1 targets card — phase-aware hero + corrected semantics"
```

### Task 1.4: Pass phaseType from DiarioPage

- [ ] **Step 1: Wire the prop**

In `src/pages/DiarioPage.tsx`, find the `<DayTotalsCard ... />` render (currently passes `totals`, `targets`, `proteinBasis`, `tdeeConfidence`) and add the `phaseType` prop:

```tsx
        <DayTotalsCard
          totals={totals}
          targets={targets}
          proteinBasis={proteinBasis}
          tdeeConfidence={tdeeConfidence}
          phaseType={activePhase.data?.phase_type as
            | 'cut'
            | 'maintenance'
            | 'bulk'
            | undefined}
        />
```

(`activePhase` is already in scope — it is used for `targets` and `tdeeConfidence`.)

- [ ] **Step 2: Typecheck + lint + full test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS — 0 type errors, 0 lint errors, all suites green (incl. the 2 new files).

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `pnpm dev`, open `/diario` with an active cut phase + a logged measurement. Confirm: kcal-remaining hero shows; over-protein sub-line is green not red; fiber under target is amber; with no active phase the hint shows and there is no hero.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DiarioPage.tsx
git commit -m "feat(diario): pass active phaseType into DayTotalsCard"
```

### Task 1.5: Phase 1 PR + docs

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: PASS (tsc -b && vite build).

- [ ] **Step 2: Update features.md**

In `docs/features.md`, in the "Macros & phases" section, replace the sentence describing the Diario consumed-vs-target view with: the card now leads with a phase-aware kcal-remaining hero (a budget on `cut`/`maintenance`, a to-goal on `bulk`) over a 2×2 macro grid; protein/fiber are floors (meeting/exceeding is success-colored, fiber-under is flagged amber), kcal-over on a non-bulk phase is the only red state, carbs/fat are informational. Presentational only.

- [ ] **Step 3: Commit + push + PR**

```bash
git add docs/features.md
git commit -m "docs(features): describe B1 targets card"
git push -u origin claude/daily-loop-1-targets-view
gh pr create --fill --base main
```

- [ ] **Step 4: Checkpoint** — wait for CI green + review approval before merging and starting Phase 2.

---

# Phase 2 — Faster logging (L1)

**Branch:** `claude/daily-loop-2-faster-logging` off the merged `main`.

**Files:**
- Create: `src/features/diario/quickAdd.ts`
- Test: `src/features/diario/quickAdd.test.ts`
- Modify: `src/components/ui/toast.tsx` (add `ToastAction`)
- Modify: `src/lib/toast-helpers.ts` (add `toastUndoableQuickAdd`)
- Modify: `src/features/diario/api.ts` (add `fetchQuickAddRecipeRows`)
- Modify: `src/features/diario/hooks.ts` (add `useQuickAddRecipes`, `useQuickAddMealLog`)
- Create: `src/features/diario/components/QuickAddStrip.tsx`
- Create: `src/features/diario/components/MealSection.tsx`
- Modify (rewrite render body): `src/pages/DiarioPage.tsx`
- Test: `src/features/diario/components/QuickAddStrip.test.tsx`
- Modify: `src/i18n/es/diario.json`, `src/i18n/en/diario.json`

### Task 2.1: Pure recent+frequent blend

- [ ] **Step 1: Write the failing test**

Create `src/features/diario/quickAdd.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildQuickAddList, type QuickAddRow } from './quickAdd';

const NOW = new Date('2026-05-18T12:00:00Z');

function row(recipeId: string, daysAgo: number, kcal = 300): QuickAddRow {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    recipeId,
    name: `R${recipeId}`,
    kcalPerServing: kcal,
    loggedOn: d.toISOString().slice(0, 10),
  };
}

describe('buildQuickAddList', () => {
  it('empty input → empty list', () => {
    expect(buildQuickAddList([], { now: NOW })).toEqual([]);
  });

  it('dedupes by recipe, most-recent first within the recent window', () => {
    const out = buildQuickAddList(
      [row('a', 1), row('b', 2), row('a', 5)],
      { now: NOW },
    );
    expect(out.map((i) => i.recipeId)).toEqual(['a', 'b']);
  });

  it('backfills with most-frequent when recent window is thin', () => {
    const rows = [
      row('a', 1), // recent
      row('b', 40), row('b', 41), row('b', 42), // frequent, outside recent window
      row('c', 50), // single, old
    ];
    const out = buildQuickAddList(rows, { now: NOW, cap: 3, recentWindowDays: 14 });
    expect(out.map((i) => i.recipeId)).toEqual(['a', 'b', 'c']);
  });

  it('respects the cap', () => {
    const rows = [row('a', 1), row('b', 2), row('c', 3), row('d', 4)];
    expect(buildQuickAddList(rows, { now: NOW, cap: 2 }).length).toBe(2);
  });

  it('carries name + kcalPerServing through', () => {
    const [item] = buildQuickAddList([row('a', 1, 540)], { now: NOW });
    expect(item).toEqual({ recipeId: 'a', name: 'Ra', kcalPerServing: 540 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run src/features/diario/quickAdd.test.ts`
Expected: FAIL — `Cannot find module './quickAdd'`.

- [ ] **Step 3: Implement the module**

Create `src/features/diario/quickAdd.ts`:

```ts
// Pure recent+frequent quick-add blend (Theme 2 / L1). No schema, no I/O:
// the caller fetches the user's recent recipe meal-logs and maps them to
// QuickAddRow[]; this picks the chip list. Deterministic (takes `now`).

export interface QuickAddRow {
  recipeId: string;
  name: string;
  kcalPerServing: number;
  loggedOn: string; // 'YYYY-MM-DD'
}

export interface QuickAddItem {
  recipeId: string;
  name: string;
  kcalPerServing: number;
}

function isoMinusDays(now: Date, days: number): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildQuickAddList(
  rows: QuickAddRow[],
  opts: { now: Date; cap?: number; recentWindowDays?: number },
): QuickAddItem[] {
  const cap = opts.cap ?? 6;
  const recentWindowDays = opts.recentWindowDays ?? 14;
  if (rows.length === 0) return [];

  const cutoff = isoMinusDays(opts.now, recentWindowDays);

  // Most-recent loggedOn + frequency per recipe (over ALL rows).
  const latest = new Map<string, string>();
  const count = new Map<string, number>();
  const meta = new Map<string, QuickAddRow>();
  for (const r of rows) {
    count.set(r.recipeId, (count.get(r.recipeId) ?? 0) + 1);
    const prev = latest.get(r.recipeId);
    if (prev == null || r.loggedOn > prev) {
      latest.set(r.recipeId, r.loggedOn);
      meta.set(r.recipeId, r);
    } else if (!meta.has(r.recipeId)) {
      meta.set(r.recipeId, r);
    }
  }

  const ids = [...latest.keys()];

  // 1. Recent: logged within the window, most-recent first.
  const recent = ids
    .filter((id) => (latest.get(id) as string) >= cutoff)
    .sort((a, b) => (latest.get(b) as string).localeCompare(latest.get(a) as string));

  const picked = new Set(recent);

  // 2. Backfill by frequency (count desc, then recency desc).
  const backfill = ids
    .filter((id) => !picked.has(id))
    .sort((a, b) => {
      const c = (count.get(b) ?? 0) - (count.get(a) ?? 0);
      if (c !== 0) return c;
      return (latest.get(b) as string).localeCompare(latest.get(a) as string);
    });

  return [...recent, ...backfill].slice(0, cap).map((id) => {
    const m = meta.get(id) as QuickAddRow;
    return { recipeId: id, name: m.name, kcalPerServing: m.kcalPerServing };
  });
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run src/features/diario/quickAdd.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/diario/quickAdd.ts src/features/diario/quickAdd.test.ts
git commit -m "feat(diario): pure recent+frequent quick-add blend (Theme 2 / L1)"
```

### Task 2.2: Add the shadcn ToastAction component

- [ ] **Step 1: Add `ToastAction` to `src/components/ui/toast.tsx`**

Add this component definition immediately before the `type ToastProps =` line:

```tsx
const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40',
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;
```

Then add `ToastAction,` to the `export { ... }` block (alphabetical-ish, e.g. after `Toast,`).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/toast.tsx
git commit -m "feat(ui): add shadcn ToastAction component"
```

### Task 2.3: Undoable quick-add toast helper

- [ ] **Step 1: Add the helper**

In `src/lib/toast-helpers.ts`, add the imports at the top:

```ts
import { ToastAction } from '@/components/ui/toast';
import { createElement } from 'react';
```

Then append this export:

```ts
/**
 * Quick-add confirmation with an inline "undo" action (Theme 2 / L1).
 * `onUndo` is fired when the user taps the action — wire it to delete the
 * just-created meal_log by id. Uses createElement so this stays a .ts file.
 */
export function toastUndoableQuickAdd(name: string, onUndo: () => void) {
  toast({
    variant: 'success',
    title: i18n.t('diario:quickAdd.added', { name }),
    durationMs: 6000,
    action: createElement(
      ToastAction,
      { altText: i18n.t('diario:quickAdd.undo'), onClick: onUndo },
      i18n.t('diario:quickAdd.undo'),
    ),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/toast-helpers.ts
git commit -m "feat(toast): undoable quick-add helper"
```

### Task 2.4: Quick-add data query + hooks

- [ ] **Step 1: Add the query to `src/features/diario/api.ts`**

Append:

```ts
import { computeRecipeMacros } from '@/features/recipes/macros';
import type { QuickAddRow } from './quickAdd';

// Recent recipe meal-logs (last 60 days) for the quick-add blend. Reuses the
// same recipe→ingredients join as fetchMealLogsForDay so per-serving kcal is
// computed from the canonical recipe-macro path. Deleted recipes are excluded
// (interim until R-01).
export async function fetchQuickAddRecipeRows(
  userId: string,
  sinceISO: string,
): Promise<QuickAddRow[]> {
  const { data, error } = await supabase
    .from('meal_logs')
    .select(
      `logged_on,
       recipe:recipes (
         id, name, servings, deleted_at,
         recipe_ingredients (
           quantity, per_serving,
           ingredient:ingredients (*)
         )
       )`,
    )
    .eq('user_id', userId)
    .not('recipe_id', 'is', null)
    .gte('logged_on', sinceISO)
    .order('logged_on', { ascending: false })
    .limit(250);
  if (error) throw error;

  const rows: QuickAddRow[] = [];
  for (const r of (data ?? []) as unknown as Array<{
    logged_on: string;
    recipe: {
      id: string;
      name: string;
      servings: number;
      deleted_at: string | null;
      recipe_ingredients: {
        quantity: number;
        per_serving: boolean;
        ingredient: RecipeIngredientJoin['ingredient'];
      }[];
    } | null;
  }>) {
    if (!r.recipe || r.recipe.deleted_at != null) continue;
    const { perServing } = computeRecipeMacros({
      servings: r.recipe.servings,
      rows: r.recipe.recipe_ingredients.map((ri) => ({
        ingredient: ri.ingredient,
        quantity: Number(ri.quantity),
        perServing: ri.per_serving,
      })),
    });
    rows.push({
      recipeId: r.recipe.id,
      name: r.recipe.name,
      kcalPerServing: Math.round(perServing.kcal),
      loggedOn: r.logged_on,
    });
  }
  return rows;
}
```

- [ ] **Step 2: Add hooks to `src/features/diario/hooks.ts`**

Add imports (extend the existing `./api` import and toast-helpers import):

```ts
import {
  createMealLog,
  deleteMealLog,
  fetchMealLogsForDay,
  fetchQuickAddRecipeRows,
  materializePlanForDate,
  updateMealLog,
  type CreateMealLogInput,
  type MealType,
} from './api';
import { buildQuickAddList } from './quickAdd';
import { toastError, toastUndoableQuickAdd } from '@/lib/toast-helpers';
```

(Keep the other existing imports from `./api` and `@/lib/toast-helpers`; just merge the names.)

Append the hooks:

```ts
function isoMinusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function useQuickAddRecipes() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['quick_add', user?.id],
    queryFn: async () => {
      const rows = await fetchQuickAddRecipeRows(user!.id, isoMinusDays(60));
      return buildQuickAddList(rows, { now: new Date() });
    },
  });
}

export function useQuickAddMealLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { recipeId: string; mealType: MealType; loggedOn: string }) =>
      createMealLog(user!.id, {
        loggedOn: v.loggedOn,
        mealType: v.mealType,
        source: { kind: 'recipe', recipeId: v.recipeId, servings: 1 },
        notes: null,
      }),
    onSuccess: (created, v) => {
      void qc.invalidateQueries({ queryKey: ['meal_logs', user?.id, v.loggedOn] });
      void qc.invalidateQueries({ queryKey: ['quick_add', user?.id] });
    },
    onError: toastError,
  });
}

export { toastUndoableQuickAdd, deleteMealLog };
```

(The re-export keeps `QuickAddStrip` importing from the diario barrel/hooks consistently.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/diario/api.ts src/features/diario/hooks.ts
git commit -m "feat(diario): quick-add query + useQuickAddRecipes/useQuickAddMealLog"
```

### Task 2.5: QuickAddStrip component

- [ ] **Step 1: Write the failing test**

Create `src/features/diario/components/QuickAddStrip.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickAddStrip } from './QuickAddStrip';

const mutate = vi.fn();
vi.mock('../hooks', () => ({
  useQuickAddMealLog: () => ({ mutate, isPending: false }),
  deleteMealLog: vi.fn(),
  toastUndoableQuickAdd: vi.fn(),
}));

describe('QuickAddStrip', () => {
  it('renders chips and fires the mutation with meal + recipe on click', () => {
    render(
      <QuickAddStrip
        mealType="dinner"
        date="2026-05-18"
        items={[{ recipeId: 'r1', name: 'Salmón', kcalPerServing: 480 }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Salmón/ }));
    expect(mutate).toHaveBeenCalledWith(
      { recipeId: 'r1', mealType: 'dinner', loggedOn: '2026-05-18' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('renders nothing when there are no items', () => {
    const { container } = render(
      <QuickAddStrip mealType="lunch" date="2026-05-18" items={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run src/features/diario/components/QuickAddStrip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/features/diario/components/QuickAddStrip.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import {
  useQuickAddMealLog,
  deleteMealLog,
  toastUndoableQuickAdd,
} from '../hooks';
import type { QuickAddItem } from '../quickAdd';
import type { MealType } from '../api';

interface Props {
  mealType: MealType;
  date: string;
  items: QuickAddItem[];
}

export function QuickAddStrip({ mealType, date, items }: Props) {
  const { t } = useTranslation('diario');
  const quickAdd = useQuickAddMealLog();

  if (items.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2">
      {items.map((it) => (
        <button
          key={it.recipeId}
          type="button"
          disabled={quickAdd.isPending}
          onClick={() =>
            quickAdd.mutate(
              { recipeId: it.recipeId, mealType, loggedOn: date },
              {
                onSuccess: (created) =>
                  toastUndoableQuickAdd(it.name, () => {
                    void deleteMealLog(created.id);
                  }),
              },
            )
          }
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300"
          aria-label={t('quickAdd.add', { name: it.name })}
        >
          <Plus className="h-3 w-3" />
          {it.name}
          <span className="tabular-nums text-sky-500 dark:text-sky-400">
            · {it.kcalPerServing}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run src/features/diario/components/QuickAddStrip.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/diario/components/QuickAddStrip.tsx src/features/diario/components/QuickAddStrip.test.tsx
git commit -m "feat(diario): QuickAddStrip chips with undo toast"
```

### Task 2.6: MealSection component

- [ ] **Step 1: Implement the component**

Create `src/features/diario/components/MealSection.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { roundMacro } from '@/features/recipes/macros';
import { computeMealLogMacros, sumMacros } from '../macros';
import type { MealLogWithJoins, MealType } from '../api';
import type { QuickAddItem } from '../quickAdd';
import { MealLogEntry } from './MealLogEntry';
import { QuickAddStrip } from './QuickAddStrip';

interface Props {
  mealType: MealType;
  date: string;
  items: MealLogWithJoins[];
  quickAddItems: QuickAddItem[];
  onAdd: (mealType: MealType) => void;
  onEdit: (log: MealLogWithJoins) => void;
}

export function MealSection({
  mealType,
  date,
  items,
  quickAddItems,
  onAdd,
  onEdit,
}: Props) {
  const { t } = useTranslation('diario');
  const subtotal =
    items.length > 0
      ? roundMacro(sumMacros(items.map(computeMealLogMacros)).kcal)
      : null;

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold">{t(`mealType.${mealType}`)}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {subtotal != null ? `${subtotal} kcal` : t('mealSection.empty')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAdd(mealType)}
          aria-label={t('addToMeal')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="divide-y">
          {items.map((log) => (
            <MealLogEntry key={log.id} log={log} onEdit={onEdit} />
          ))}
        </ul>
      )}
      <QuickAddStrip mealType={mealType} date={date} items={quickAddItems} />
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/diario/components/MealSection.tsx
git commit -m "feat(diario): MealSection (header + subtotal + entries + quick-add)"
```

### Task 2.7: Wire DiarioPage to always-render sections

- [ ] **Step 1: Add i18n keys**

In `src/i18n/es/diario.json` add inside the root object (e.g. after `"entry"`):

```json
  "mealSection": { "empty": "— sin registros" },
  "quickAdd": {
    "add": "Añadir {{name}}",
    "added": "{{name}} añadido",
    "undo": "Deshacer"
  },
```

In `src/i18n/en/diario.json`:

```json
  "mealSection": { "empty": "— nothing logged" },
  "quickAdd": {
    "add": "Add {{name}}",
    "added": "{{name}} added",
    "undo": "Undo"
  },
```

- [ ] **Step 2: Replace the render branch in `src/pages/DiarioPage.tsx`**

Add the hook import + usage near the other hooks:

```tsx
import { useMaterializePlan, useMealLogsForDay, useQuickAddRecipes } from '@/features/diario/hooks';
import { MealSection } from '@/features/diario/components/MealSection';
```

Inside the component, after `const materialize = useMaterializePlan();`:

```tsx
  const quickAdd = useQuickAddRecipes();
  const quickAddItems = quickAdd.data ?? [];
```

Then replace the entire `{logs.isLoading ? ( ... ) : isEmpty ? ( ... ) : ( ... )}` block with:

```tsx
      {logs.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="py-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {MEAL_TYPE_ORDER.map((mt) => {
            const items = grouped.get(mt) ?? [];
            // 'other' is a fallback bucket — only show it when it has entries.
            if (mt === 'other' && items.length === 0) return null;
            return (
              <MealSection
                key={mt}
                mealType={mt}
                date={date}
                items={items}
                quickAddItems={quickAddItems}
                onAdd={openNew}
                onEdit={openEdit}
              />
            );
          })}
        </div>
      )}
```

Remove the now-unused `isEmpty` const and the unused `MealLogEntry` import (lint will flag them). Keep everything else (DateNavigator, DayTotalsCard, MealLogDialog) unchanged.

- [ ] **Step 3: Typecheck + lint + full test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS — 0 errors, all suites green.

- [ ] **Step 4: Manual smoke**

Run: `pnpm dev`, open `/diario`. Confirm: Breakfast/Lunch/Snack/Dinner all render even when empty; each shows a kcal subtotal or "— sin registros"; quick-add chips appear (if you have recent recipe logs); tapping a chip logs 1 serving and shows an undo toast; "Undo" removes it.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DiarioPage.tsx src/i18n/es/diario.json src/i18n/en/diario.json
git commit -m "feat(diario): always-render meal sections + quick-add (L1)"
```

### Task 2.8: Phase 2 PR + docs

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 2: Update features.md**

In `docs/features.md`, "Diario & materialization" section, add: every meal section renders even when empty (each with a per-meal kcal subtotal and an add button); a recent+frequent (no-schema, derived from `meal_logs`) quick-add chip strip under each meal logs one serving instantly with an undo toast.

- [ ] **Step 3: Commit + push + PR**

```bash
git add docs/features.md
git commit -m "docs(features): describe L1 faster-logging"
git push -u origin claude/daily-loop-2-faster-logging
gh pr create --fill --base main
```

- [ ] **Step 4: Checkpoint** — CI green + review before merge and Phase 3.

---

# Phase 3 — Trend-truth on Progreso (T1 + T1b)

**Branch:** `claude/daily-loop-3-trend-truth` off the merged `main`.

**Files:**
- Create: `src/features/measurements/trend.ts`
- Test: `src/features/measurements/trend.test.ts`
- Modify (full rewrite): `src/features/measurements/components/LatestMeasurementCard.tsx`
- Test: `src/features/measurements/components/LatestMeasurementCard.test.tsx`
- Modify: `src/features/measurements/components/WeightChart.tsx` (target reference line)
- Modify: `src/pages/ProgresoPage.tsx` (wire smoothed/recent/goal/phase)
- Modify: `src/i18n/es/metricas.json`, `src/i18n/en/metricas.json`

### Task 3.1: Pure trend math

- [ ] **Step 1: Write the failing test**

Create `src/features/measurements/trend.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  smoothedRatePerWeek,
  compositionDelta,
  deltaTone,
  TREND_LOOKBACK_DAYS,
} from './trend';

describe('smoothedRatePerWeek', () => {
  it('null with fewer than 2 usable points', () => {
    expect(
      smoothedRatePerWeek([{ measuredOn: '2026-05-18', ma5: 80 }], '2026-05-18'),
    ).toBeNull();
  });

  it('computes kg/week from the ~7-days-ago point', () => {
    const r = smoothedRatePerWeek(
      [
        { measuredOn: '2026-05-11', ma5: 79.3 },
        { measuredOn: '2026-05-18', ma5: 78.7 },
      ],
      '2026-05-18',
    );
    expect(r).toBeCloseTo(-0.6, 5);
  });

  it('ignores null ma5 points', () => {
    const r = smoothedRatePerWeek(
      [
        { measuredOn: '2026-05-11', ma5: 79.3 },
        { measuredOn: '2026-05-14', ma5: null },
        { measuredOn: '2026-05-18', ma5: 78.7 },
      ],
      '2026-05-18',
    );
    expect(r).toBeCloseTo(-0.6, 5);
  });
});

describe('compositionDelta', () => {
  it('latest minus the ≥7d-older prior', () => {
    const d = compositionDelta(
      [
        { measuredOn: '2026-05-01', value: 18.9 },
        { measuredOn: '2026-05-18', value: 18.2 },
      ],
      '2026-05-18',
    );
    expect(d).toBeCloseTo(-0.7, 5);
  });

  it('null when no prior non-null', () => {
    expect(
      compositionDelta([{ measuredOn: '2026-05-18', value: 18.2 }], '2026-05-18'),
    ).toBeNull();
  });
});

describe('deltaTone', () => {
  it('muscle is phase-independent: up=good, down=bad', () => {
    expect(deltaTone('muscle', 1)).toBe('good');
    expect(deltaTone('muscle', -1)).toBe('bad');
  });
  it('water is always neutral', () => {
    expect(deltaTone('water', -1, 'cut')).toBe('neutral');
  });
  it('weight on a cut: down=good, up=bad', () => {
    expect(deltaTone('weight', -1, 'cut')).toBe('good');
    expect(deltaTone('weight', 1, 'cut')).toBe('bad');
  });
  it('weight on a bulk: up=good', () => {
    expect(deltaTone('weight', 1, 'bulk')).toBe('good');
  });
  it('weight with no phase is neutral', () => {
    expect(deltaTone('weight', -1)).toBe('neutral');
  });
  it('body fat down=good when any phase is active, neutral otherwise', () => {
    expect(deltaTone('bodyFat', -1, 'bulk')).toBe('good');
    expect(deltaTone('bodyFat', -1)).toBe('neutral');
  });
  it('exposes the lookback constant', () => {
    expect(TREND_LOOKBACK_DAYS).toBe(7);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run src/features/measurements/trend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/features/measurements/trend.ts`:

```ts
// Pure trend math for Progreso (Theme 3). Deterministic — every fn takes an
// explicit `asOfISO`. Dates are 'YYYY-MM-DD' (lexicographically orderable).

export type DeltaMetric = 'weight' | 'bodyFat' | 'muscle' | 'water';
export type DeltaTone = 'good' | 'bad' | 'neutral';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';

export const TREND_LOOKBACK_DAYS = 7;

export interface SmoothedPoint {
  measuredOn: string;
  ma5: number | null;
}

export interface CompositionPoint {
  measuredOn: string;
  value: number | null;
}

function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(`${aISO}T00:00:00Z`);
  const b = Date.parse(`${bISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function isoMinusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** kg/week from the latest smoothed point vs the most recent point at least
 *  TREND_LOOKBACK_DAYS older. null if not derivable. */
export function smoothedRatePerWeek(
  points: SmoothedPoint[],
  asOfISO: string,
): number | null {
  const usable = points
    .filter((p) => p.ma5 != null)
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  if (usable.length < 2) return null;
  const latest = usable[usable.length - 1];
  const cutoff = isoMinusDays(latest.measuredOn, TREND_LOOKBACK_DAYS);
  const prior =
    [...usable].reverse().find((p) => p.measuredOn <= cutoff) ?? usable[0];
  if (prior.measuredOn === latest.measuredOn) return null;
  const days = daysBetween(prior.measuredOn, latest.measuredOn);
  if (days <= 0) return null;
  return ((latest.ma5 as number) - (prior.ma5 as number)) / days * 7;
}

/** latest non-null minus the most recent non-null at least
 *  TREND_LOOKBACK_DAYS older (fallback: nearest prior non-null). */
export function compositionDelta(
  points: CompositionPoint[],
  asOfISO: string,
): number | null {
  const usable = points
    .filter((p) => p.value != null)
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  if (usable.length < 2) return null;
  const latest = usable[usable.length - 1];
  const cutoff = isoMinusDays(latest.measuredOn, TREND_LOOKBACK_DAYS);
  const older = [...usable]
    .slice(0, -1)
    .reverse();
  const prior = older.find((p) => p.measuredOn <= cutoff) ?? older[0];
  if (!prior) return null;
  return (latest.value as number) - (prior.value as number);
}

export function deltaTone(
  metric: DeltaMetric,
  deltaSign: number,
  phaseType?: PhaseType,
): DeltaTone {
  const s = Math.sign(deltaSign);
  if (s === 0) return 'neutral';
  if (metric === 'muscle') return s > 0 ? 'good' : 'bad';
  if (metric === 'water') return 'neutral';
  if (metric === 'bodyFat') {
    if (!phaseType) return 'neutral';
    return s < 0 ? 'good' : 'bad';
  }
  // weight
  if (phaseType === 'cut') return s < 0 ? 'good' : 'bad';
  if (phaseType === 'bulk') return s > 0 ? 'good' : 'bad';
  return 'neutral'; // maintenance or no phase
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm exec vitest run src/features/measurements/trend.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/measurements/trend.ts src/features/measurements/trend.test.ts
git commit -m "feat(measurements): pure trend math (rate/week, delta, phase-aware tone)"
```

### Task 3.2: i18n keys for the trend card

- [ ] **Step 1: Spanish** — in `src/i18n/es/metricas.json`, add inside `"latest"`:

```json
    "weightTrendLabel": "Peso · tendencia (media 5d)",
    "ratePerWeek": "{{n}} kg / sem",
    "sinceStart": "{{n}} kg desde el inicio",
    "toGoal": "faltan {{n}} kg al objetivo ({{target}})",
    "noTrend": "tendencia no disponible aún",
```

and inside `"charts"."weight"`:

```json
      "targetLine": "objetivo {{n}} kg"
```

- [ ] **Step 2: English** — in `src/i18n/en/metricas.json`, add inside `"latest"`:

```json
    "weightTrendLabel": "Weight · trend (5-day avg)",
    "ratePerWeek": "{{n}} kg / wk",
    "sinceStart": "{{n}} kg since the start",
    "toGoal": "{{n}} kg to goal ({{target}})",
    "noTrend": "trend not available yet",
```

and inside `"charts"."weight"`:

```json
      "targetLine": "goal {{n}} kg"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/metricas.json src/i18n/en/metricas.json
git commit -m "i18n(metricas): trend headline keys (Theme 3)"
```

### Task 3.3: Rewrite LatestMeasurementCard (T1 + T1b)

- [ ] **Step 1: Write the failing component test**

Create `src/features/measurements/components/LatestMeasurementCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatestMeasurementCard } from './LatestMeasurementCard';

vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({
    data: { sex: 'male', birth_date: '1990-01-01', height_cm: 178, initial_weight_kg: 82 },
  }),
}));

const latest = {
  id: 'm1',
  measured_on: '2026-05-18',
  weight_kg: 78.4,
  body_fat_pct: 18.2,
  muscle_pct: 41.1,
  water_pct: 55.3,
  notes: null,
} as never;

const smoothed = [
  { measured_on: '2026-05-11', weight_kg: 79.4, weight_kg_5day_avg: 79.3 },
  { measured_on: '2026-05-18', weight_kg: 78.4, weight_kg_5day_avg: 78.7 },
] as never;

it('shows the smoothed weight headline and rate/week', () => {
  render(
    <LatestMeasurementCard
      latest={latest}
      todayEntry={latest}
      loading={false}
      onLogToday={() => {}}
      onEditToday={() => {}}
      smoothed={smoothed}
      recent={[latest]}
      phaseType="cut"
      targetBodyFatPct={12}
    />,
  );
  expect(screen.getByText('78.7')).toBeInTheDocument();
  expect(screen.getByText(/\/ ?(sem|wk)/i)).toBeInTheDocument();
});

it('omits the to-goal clause when no targetBodyFatPct', () => {
  render(
    <LatestMeasurementCard
      latest={latest}
      todayEntry={latest}
      loading={false}
      onLogToday={() => {}}
      onEditToday={() => {}}
      smoothed={smoothed}
      recent={[latest]}
      phaseType="cut"
    />,
  );
  expect(screen.queryByText(/objetivo|to goal/i)).toBeNull();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run src/features/measurements/components/LatestMeasurementCard.test.tsx`
Expected: FAIL — new props (`smoothed`, `recent`, `phaseType`, `targetBodyFatPct`) don't exist yet.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/features/measurements/components/LatestMeasurementCard.tsx` with:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { daysBetween, formatDate, isoDate, type Locale } from '@/lib/dates';
import { computeTargetWeightKg, estimatedBmr } from '@/lib/macros';
import { useProfile } from '@/features/profile/hooks';
import type { BodyMeasurement } from '../api';
import type { SmoothedMeasurement } from '../api';
import {
  compositionDelta,
  deltaTone,
  smoothedRatePerWeek,
  type DeltaMetric,
  type DeltaTone,
  type PhaseType,
} from '../trend';

interface Props {
  latest: BodyMeasurement | null | undefined;
  todayEntry: BodyMeasurement | null | undefined;
  loading: boolean;
  onLogToday: () => void;
  onEditToday: () => void;
  smoothed: SmoothedMeasurement[];
  recent: BodyMeasurement[];
  phaseType?: PhaseType;
  targetBodyFatPct?: number;
}

const TONE_CLASS: Record<DeltaTone, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
};

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

function signed(n: number, digits = 1): string {
  const v = fmt(Math.abs(n), digits);
  if (n > 0) return `↑ ${v}`;
  if (n < 0) return `↓ ${v}`;
  return `· ${v}`;
}

function CompStat({
  label,
  value,
  delta,
  metric,
  phaseType,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  metric: DeltaMetric;
  phaseType?: PhaseType;
}) {
  if (value === null) return null;
  const tone =
    delta == null ? 'neutral' : deltaTone(metric, Math.sign(delta), phaseType);
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">%</span>
      </div>
      {delta != null && (
        <div className={cn('text-[11px] font-semibold tabular-nums', TONE_CLASS[tone])}>
          {signed(delta)}
        </div>
      )}
    </div>
  );
}

export function LatestMeasurementCard({
  latest,
  todayEntry,
  loading,
  onLogToday,
  onEditToday,
  smoothed,
  recent,
  phaseType,
  targetBodyFatPct,
}: Props) {
  const { t, i18n } = useTranslation('metricas');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const profile = useProfile();

  const bmr = estimatedBmr({
    sex: profile.data?.sex,
    birthDate: profile.data?.birth_date,
    heightCm: profile.data?.height_cm,
    weightKg: latest?.weight_kg,
    asOfISO: isoDate(),
  });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('latest.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('latest.loading')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('latest.title')}</CardTitle>
          <CardDescription>{t('latest.emptyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onLogToday}>{t('latest.logFirst')}</Button>
        </CardContent>
      </Card>
    );
  }

  const today = isoDate();
  const isToday = todayEntry !== null && todayEntry !== undefined;
  const daysOld = daysBetween(latest.measured_on, today);

  let staleLabel = '';
  if (!isToday) {
    if (daysOld <= 0) staleLabel = t('latest.stale.today');
    else if (daysOld === 1) staleLabel = t('latest.stale.yesterday');
    else staleLabel = t('latest.stale.daysAgo', { count: daysOld });
  }

  // --- Trend ---
  const smoothedPoints = smoothed
    .filter((m) => m.measured_on)
    .map((m) => ({
      measuredOn: m.measured_on as string,
      ma5: m.weight_kg_5day_avg,
    }));
  const latestMa5 =
    [...smoothedPoints].reverse().find((p) => p.ma5 != null)?.ma5 ?? null;
  const rate = smoothedRatePerWeek(smoothedPoints, today);
  const rateTone: DeltaTone =
    rate == null ? 'neutral' : deltaTone('weight', Math.sign(rate), phaseType);

  const initial = profile.data?.initial_weight_kg ?? null;
  const sinceStart =
    latestMa5 != null && initial != null ? latestMa5 - initial : null;

  const targetWeight =
    targetBodyFatPct != null && latest.body_fat_pct != null && latest.weight_kg != null
      ? computeTargetWeightKg({
          currentWeightKg: latest.weight_kg,
          currentBodyFatPct: latest.body_fat_pct,
          targetBodyFatPct,
        })
      : null;
  const toGoal =
    targetWeight != null && latestMa5 != null ? latestMa5 - targetWeight : null;

  function compPoints(field: 'body_fat_pct' | 'muscle_pct' | 'water_pct') {
    return [...recent]
      .filter((m) => m.measured_on)
      .sort((a, b) => (a.measured_on as string).localeCompare(b.measured_on as string))
      .map((m) => ({ measuredOn: m.measured_on as string, value: m[field] }));
  }
  const bfDelta = compositionDelta(compPoints('body_fat_pct'), today);
  const muscleDelta = compositionDelta(compPoints('muscle_pct'), today);
  const waterDelta = compositionDelta(compPoints('water_pct'), today);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{t('latest.title')}</CardTitle>
          <CardDescription>
            {isToday
              ? t('latest.measuredToday')
              : t('latest.measuredOn', {
                  date: formatDate(latest.measured_on, 'd MMM yyyy', locale),
                })}
          </CardDescription>
        </div>
        {isToday ? (
          <Button variant="outline" size="sm" onClick={onEditToday}>
            {t('latest.editToday')}
          </Button>
        ) : (
          <Button size="sm" onClick={onLogToday}>
            {t('latest.logToday')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!isToday && (
          <div
            role="status"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
          >
            {t('latest.stale.prefix')} {staleLabel} · {t('latest.stale.usingValues')}
          </div>
        )}

        {/* Weight headline (smoothed) */}
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('latest.weightTrendLabel')}
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-3xl font-bold tabular-nums leading-none">
              {latestMa5 != null ? fmt(latestMa5) : latest.weight_kg}
            </span>
            <span className="text-sm text-muted-foreground">kg</span>
            {rate != null && (
              <span
                className={cn('text-sm font-semibold tabular-nums', TONE_CLASS[rateTone])}
              >
                {signed(rate)} {t('latest.ratePerWeek', { n: '' }).trim()}
              </span>
            )}
          </div>
          {(sinceStart != null || toGoal != null) && (
            <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
              {sinceStart != null &&
                t('latest.sinceStart', { n: signed(sinceStart).replace(/[↑↓·] /, (m) =>
                  m.startsWith('↓') ? '-' : m.startsWith('↑') ? '+' : '') })}
              {sinceStart != null && toGoal != null && ' · '}
              {toGoal != null &&
                t('latest.toGoal', {
                  n: fmt(Math.abs(toGoal)),
                  target: targetWeight != null ? fmt(targetWeight) : '',
                })}
            </div>
          )}
        </div>

        {/* BMR — quiet, derived, no delta (T1b) */}
        {bmr !== null && (
          <div className="flex items-baseline justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">{t('fields.estimatedBmr')}</span>
            <span className="font-semibold tabular-nums">{Math.round(bmr)} kcal</span>
          </div>
        )}
        {bmr !== null && (
          <p className="text-[11px] text-muted-foreground -mt-2">
            {t('fields.estimatedBmrHelp')}
          </p>
        )}

        {/* Composition 3-up with phase-aware deltas */}
        <div className="grid grid-cols-3 gap-4 border-t pt-4">
          <CompStat
            label={t('fields.bodyFatPct')}
            value={latest.body_fat_pct}
            delta={bfDelta}
            metric="bodyFat"
            phaseType={phaseType}
          />
          <CompStat
            label={t('fields.musclePct')}
            value={latest.muscle_pct}
            delta={muscleDelta}
            metric="muscle"
            phaseType={phaseType}
          />
          <CompStat
            label={t('fields.waterPct')}
            value={latest.water_pct}
            delta={waterDelta}
            metric="water"
            phaseType={phaseType}
          />
        </div>

        {latest.notes && (
          <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
            {latest.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

> Implementation note for the `sinceStart` string: the inline `.replace` keeps a leading `+`/`-` sign for the "since start" figure (the arrow glyphs read oddly mid-sentence). If lint dislikes the regex callback, replace with: `const ss = sinceStart >= 0 ? '+' : '-'; ... t('latest.sinceStart', { n: ss + fmt(Math.abs(sinceStart)) })`.

- [ ] **Step 4: Run the component test, verify it passes**

Run: `pnpm exec vitest run src/features/measurements/components/LatestMeasurementCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/measurements/components/LatestMeasurementCard.tsx src/features/measurements/components/LatestMeasurementCard.test.tsx
git commit -m "feat(progreso): T1/T1b trend card — smoothed headline, BMR, phase-aware Δ"
```

### Task 3.4: Weight chart target reference line

- [ ] **Step 1: Add the prop + reference line**

In `src/features/measurements/components/WeightChart.tsx`:

Add `ReferenceLine` to the recharts import:

```tsx
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
```

Change the signature to accept a prop:

```tsx
export function WeightChart({ targetWeightKg }: { targetWeightKg?: number | null }) {
```

Extend `yDomain` so the target line is always visible — replace the `values` line inside the `yDomain` useMemo with:

```tsx
    const values = points
      .flatMap((p) => [p.weight, p.ma5])
      .filter((v): v is number => v != null);
    if (targetWeightKg != null) values.push(targetWeightKg);
```

and add `targetWeightKg` to that `useMemo` dependency array (`}, [points, targetWeightKg]);`).

Inside `<LineChart>`, immediately after `<CartesianGrid .../>`, add:

```tsx
                {targetWeightKg != null && (
                  <ReferenceLine
                    y={targetWeightKg}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="4 4"
                    label={{
                      value: t('charts.weight.targetLine', {
                        n: targetWeightKg.toFixed(1),
                      }),
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: 'hsl(var(--primary))',
                    }}
                  />
                )}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/measurements/components/WeightChart.tsx
git commit -m "feat(progreso): optional derived target-weight reference line"
```

### Task 3.5: Wire ProgresoPage

- [ ] **Step 1: Update `src/pages/ProgresoPage.tsx`**

Replace the file contents with:

```tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CompositionChart } from '@/features/measurements/components/CompositionChart';
import { LatestMeasurementCard } from '@/features/measurements/components/LatestMeasurementCard';
import { MeasurementDialog } from '@/features/measurements/components/MeasurementDialog';
import { MeasurementsList } from '@/features/measurements/components/MeasurementsList';
import { WeightChart } from '@/features/measurements/components/WeightChart';
import { MacrosChart } from '@/features/progreso/components/MacrosChart';
import {
  useLatestMeasurement,
  useRecentMeasurements,
  useSmoothedMeasurements,
} from '@/features/measurements/hooks';
import { useActivePhase } from '@/features/phases/hooks';
import { useGoal } from '@/features/objetivos/hooks';
import { computeTargetWeightKg } from '@/lib/macros';
import type { BodyMeasurement } from '@/features/measurements/api';
import type { PhaseType } from '@/features/measurements/trend';
import { isoDate } from '@/lib/dates';

export function ProgresoPage() {
  const { t } = useTranslation('metricas');
  const today = isoDate();

  const latestQuery = useLatestMeasurement();
  const recentQuery = useRecentMeasurements(30);
  const smoothedQuery = useSmoothedMeasurements('90d');
  const activePhase = useActivePhase();
  const goal = useGoal();

  const todayEntry = useMemo<BodyMeasurement | null>(() => {
    const entry = recentQuery.data?.find((m) => m.measured_on === today);
    return entry ?? null;
  }, [recentQuery.data, today]);

  const phaseType = activePhase.data?.phase_type as PhaseType | undefined;
  const targetBodyFatPct = goal.data?.target_body_fat_pct ?? undefined;

  const targetWeightKg = useMemo<number | null>(() => {
    const m = latestQuery.data;
    if (
      targetBodyFatPct == null ||
      !m ||
      m.body_fat_pct == null ||
      m.weight_kg == null
    ) {
      return null;
    }
    return computeTargetWeightKg({
      currentWeightKg: m.weight_kg,
      currentBodyFatPct: m.body_fat_pct,
      targetBodyFatPct,
    });
  }, [latestQuery.data, targetBodyFatPct]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);

  function openForToday() {
    setEditing(todayEntry);
    setDialogOpen(true);
  }

  function openForEdit(m: BodyMeasurement) {
    setEditing(m);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
      </div>

      <LatestMeasurementCard
        latest={latestQuery.data}
        todayEntry={todayEntry}
        loading={latestQuery.isLoading}
        onLogToday={openForToday}
        onEditToday={openForToday}
        smoothed={smoothedQuery.data ?? []}
        recent={recentQuery.data ?? []}
        phaseType={phaseType}
        targetBodyFatPct={targetBodyFatPct}
      />

      <WeightChart targetWeightKg={targetWeightKg} />

      <CompositionChart />

      <MacrosChart />

      <MeasurementsList
        measurements={recentQuery.data ?? []}
        loading={recentQuery.isLoading}
        onEdit={openForEdit}
      />

      <MeasurementDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        defaultDate={today}
        existing={editing}
        prefillFrom={!editing && !todayEntry ? latestQuery.data : null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint + full test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS — 0 errors, all suites green.

- [ ] **Step 3: Manual smoke**

Run: `pnpm dev`, open `/progreso`. With an active cut phase + a goal bf% set + ≥2 smoothed points spanning ≥7 days: weight headline shows the smoothed value + a colored kg/wk; "since start" + "to goal" line shows; BMR line is delta-free; composition deltas are colored per phase (bf↓ green on a cut); the weight chart shows a dashed goal line. With no goal: no to-goal clause, no chart line. With no phase: deltas neutral.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProgresoPage.tsx
git commit -m "feat(progreso): wire smoothed/recent/goal/phase into trend card + chart"
```

### Task 3.6: Phase 3 PR + docs

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 2: Update features.md**

In `docs/features.md`, "Body composition & measurements" section, add: the latest-measurement card leads with the **smoothed** (5-day-avg) weight trend (value + kg/week + since-start + to-goal), BMR is a quiet delta-free line, composition metrics show a ≥7-day delta colored per the active phase (neutral when none), and the weight chart carries a derived target-weight reference line when a goal bf% is set. Derived/presentational only — never stored, never feeds protein/TDEE.

- [ ] **Step 3: Commit + push + PR**

```bash
git add docs/features.md
git commit -m "docs(features): describe T1/T1b trend-truth"
git push -u origin claude/daily-loop-3-trend-truth
gh pr create --fill --base main
```

- [ ] **Step 4: Final checkpoint** — CI green + review before merge.

---

## Self-review (against the spec)

**Spec coverage:**
- Theme 1 B1 (phase-aware hero, 2×2 grid, floor/budget/flex semantics, no-target hint) → Tasks 1.1–1.5. ✓
- Theme 2 L1 (always-render sections, per-meal kcal subtotal, recent+frequent no-schema blend, instant log + undo toast, MealSection/QuickAddStrip extraction, `createMealLog` returns id) → Tasks 2.1–2.8. ✓ ('other' empty-bucket exclusion is an explicit, documented refinement of "all sections".)
- Theme 3 T1+T1b (smoothed headline + rate/week, since-start, conditional to-goal + reference line, BMR delta-free under hero, 3-up composition, phase-aware Δ with neutral fallback) → Tasks 3.1–3.6. ✓
- Cross-cutting: pure Vitest Tier-1 modules (`targetStatus`, `quickAdd`, `trend`) + Tier-2 component tests; no schema/migration/edge; per-phase branch→PR→CI→checkpoint; features.md updated on merge. ✓
- Out of scope (projection, favorites/schema, push) — not introduced anywhere. ✓

**Placeholder scan:** No TBD/TODO/"handle errors"/"similar to"; every code step has complete code; error paths use the existing `toastError`/`onError` pattern explicitly.

**Type consistency:** `MacroKey`/`MacroTone`/`PhaseType` (targetStatus) used identically in DayTotalsCard; `QuickAddRow`/`QuickAddItem` consistent across quickAdd.ts/api.ts/hooks/QuickAddStrip; `DeltaMetric`/`DeltaTone`/`PhaseType`/`SmoothedPoint`/`CompositionPoint` consistent across trend.ts/LatestMeasurementCard; `useQuickAddMealLog` mutate signature `{recipeId, mealType, loggedOn}` matches QuickAddStrip call and the `createMealLog` `{kind:'recipe',recipeId,servings}` source union; `WeightChart` `targetWeightKg` prop matches ProgresoPage usage.

**One verify-at-impl note:** `profiles.initial_weight_kg` is assumed present (the A7 anchor). If the generated type names it differently, adjust the `profile.data?.initial_weight_kg` read in Task 3.3 / the mock in its test.
