# Decimal point in display — shared locale-aware number formatter

**Date:** 2026-07-17
**Thread:** decimal-point-in-display
**Type:** cross-cutting refactor (display side of the numeric locale boundary)

## Problem

Numbers render with a decimal **point** in Spanish (`82.4 kg`) where the locale
wants a **comma** (`82,4 kg`). This is the output-side mirror of the input bug
already fixed in #198 (`parseDecimalInput` / `NumberField`): the input boundary
now accepts both `,` and `.` and stores point; the **display** boundary was
never unified and is inconsistent:

- **9 sites use `toFixed()`** → always emit a `.`, regardless of language. This
  is the reported bug.
- **6 sites already localise**, but four of them hardcode `es-ES`
  (`toLocaleString('es-ES')`), so an English user gets Spanish grouping — the
  same class of bug, latent, in the other direction. The remaining two already
  branch on `lang` (inline `Intl.NumberFormat`); we still route them through the
  helper so there is one code path, not three.

There is no single place that turns a number into a display string. The fix is
the symmetric partner of the parser: one shared, locale-aware formatter.

## Decision

**Unify all number display through one helper** (approved: unify, not the
minimal 9-site fix), and **preserve fixed fraction digits** (approved: the bug
is the separator, not the rounding — no displayed precision changes).

## Design

### The formatter — `src/lib/number.ts` (mirror of the parser)

Add a pure formatting function next to `parseDecimalInput`, in the same module,
with a header comment explaining it is the emit-locale counterpart to the
accept-both parser.

```ts
type Lang = 'es' | 'en';

interface FormatDecimalOptions {
  lang: Lang | string;   // i18n.language; anything non-'en' → es-ES
  digits?: number;       // fixed fraction digits, default 1
  signed?: boolean;      // '+82,4' / '0,0' via signDisplay 'exceptZero'
}

export function formatDecimal(n: number, opts: FormatDecimalOptions): string;
```

Behaviour:

- **Locale mapping** is centralised here (today it is inlined twice):
  `lang === 'en' ? 'en-US' : 'es-ES'`. This is the ONLY place that mapping
  lives after this change.
- **Fixed digits:** `minimumFractionDigits === maximumFractionDigits === digits`
  so `82.0` still renders `82,0` — precision is preserved exactly.
- **Grouping** stays on (Intl default): thousands separators for kcal/qty keep
  working (`1234` → `1.234` in es-ES, `1,234` in en-US).
- **`signed`** maps to `signDisplay: 'exceptZero'`: `+82,4` for positive,
  `-1,3` for negative, and **no sign for zero** — which also absorbs the
  `-0.04 → 0,0` rounding-artefact case that `formatDeltaKg` handles by hand
  today (a value that rounds to `-0.0` is zero, so `exceptZero` emits no sign).
- Pure function taking `lang` explicitly (NOT a hook, NOT reading the i18n
  singleton): three call sites are recharts `formatter` callbacks and two are
  module-level helpers where hooks are unavailable. Callers pass
  `i18n.language`, exactly as the codebase already threads `locale`/`lang`.

### The quantity formatter — `formatQuantity(n, { lang, maxDigits=3 })`

Discovered during implementation: servings, grams and unidades are **natural**
quantities — whole or fractional (`1`, `1,5`, `0,25`), with trailing zeros
**trimmed**. `formatDecimal`'s fixed digits would round `1,5 → 2` at `digits:0`,
so these need an up-to-N-digits partner that preserves the existing
`Intl.NumberFormat(locale)` (default) behaviour those sites already had:

```ts
export function formatQuantity(n: number, opts: { lang: string; maxDigits?: number }): string;
```

Split rule: **fixed decimal place → `formatDecimal`** (kg/kcal columns that must
align); **natural quantity → `formatQuantity`** (a step control's readout).
`localeFor` is shared by both — still one locale-mapping site.

- `formatDecimal(_, { digits: 0 })` — kcal only, and only because kcal reaches
  the ring already `roundMacro`-ed to an integer (fixed-0 == natural there).
- `formatQuantity` — servings (AddRecipeDrawer), the `QuantityStepper` readout,
  and `describeMealLog`'s servings/grams detail.

### Call sites (15 total)

**Decimal display — replace `toFixed()` (9):**

| File | Line | Note |
|---|---|---|
| `features/measurements/components/CompositionChart.tsx` | 193 | recharts formatter — lang from component scope |
| `features/measurements/components/TrendChart.tsx` | 81 | recharts formatter |
| `features/measurements/components/WeightChart.tsx` | 125, 136 | recharts formatter + target-line label |
| `features/measurements/components/MeasurementDialog.tsx` | 44 | `Math.abs(n)`, digits 1 |
| `features/measurements/components/CompositionCard.tsx` | 38 | `Math.abs(n)`, variable digits |
| `features/diario/components/BodyQuickMeasureCard.tsx` | 26 | `Math.abs(n)`, digits 2 |
| `features/training/muscleMap/MuscleActivityView.tsx` | 99 | integer-or-1-decimal tooltip |
| `features/training/components/ExerciseHistory.tsx` | 96 | e1RM kg |
| `pages/MeasurementHistoryPage.tsx` | 26–29, 47 | `formatDeltaKg` (signed) + `formatKg` helpers |

**Locale-hardcoded — route through the helper (6):**

| File | Line | Change |
|---|---|---|
| `features/diario/components/KcalRing.tsx` | 77, 80 | `toLocaleString('es-ES')` → `formatDecimal(_, {lang, digits:0})` |
| `features/diario/macros.ts` | 154, 162 | same (this is a non-component module → lang threaded in by caller) |
| `features/planning/components/AddRecipeDrawer.tsx` | 199 | inline `Intl` branch → helper |
| `components/ui/QuantityStepper.tsx` | 27 | inline `Intl` branch → helper |

**Explicitly excluded:**

- `features/phases/components/PhaseEditorForm.tsx:86` — `toFixed(1)` here produces
  the **string value of a numeric input**, not display text. It belongs to the
  *input* boundary (emit-point) and must NOT be localised, or the field would be
  seeded with a comma the browser input then chokes on.

### `features/diario/macros.ts` — the one threading wrinkle

`macros.ts` is a pure module (not a component) that today hardcodes `es-ES`.
Its functions must receive `lang` from their callers. Trace the callers: they
are components with `useTranslation`, so `lang` is available there. If threading
`lang` through `macros.ts` proves to reach more than ~2 call layers, fall back
to leaving `macros.ts` on a fixed `es-ES` for this pass and note it — the
reported bug is the `toFixed` sites; the `macros.ts` grouping is cosmetic and
already comma-correct in Spanish. (Plan step will confirm the call depth before
committing to the thread-through.)

## Testing

- **Unit (`src/lib/number.test.ts`)** — the bulk of the coverage, table-driven:
  - es vs en separator: `formatDecimal(82.4, {lang:'es'})` → `'82,4'`;
    `{lang:'en'}` → `'82.4'`.
  - fixed digits: `82` → `'82,0'` (digits 1), `'82,00'` (digits 2), `'82'` (digits 0).
  - grouping: `1234` at digits 0 → `'1.234'` (es) / `'1,234'` (en).
  - signed: `+82,4` / `-1,3` / `0,0`; and the artefact `-0.04 → '0,0'`.
  - unknown lang falls back to es-ES.
- **Component** — no new component tests unless a call site's test asserts a
  formatted string; update those to expect the localised output. jsdom's `Intl`
  is real (Node), so es-ES/en-US formatting works in tests.
- **Manual/browser** — one pass in the real app in ES confirming weights,
  deltas, kcal, composition chart tooltips render commas; flip to EN, confirm
  points. (Charts are canvas/SVG — jsdom can't see them; a real-browser pass is
  required per the jsdom-CSS lesson.)

## Out of scope

- The input boundary (`parseDecimalInput`) — already correct, untouched.
- Rounding/precision changes — fixed digits preserved verbatim.
- `PhaseEditorForm:86` — input value, not display.
- Any number NOT currently rendered to the user (internal maths stays numeric).

## Success criteria

1. In Spanish, every user-facing decimal shows a comma; in English, a point.
2. No displayed precision changes (fixed fraction digits preserved).
3. Exactly one place maps `lang → BCP-47 locale`; no `toFixed()` or hardcoded
   `es-ES` remains in a display path (grep-clean, save the excluded input site).
4. `pnpm lint` + `pnpm build` + `pnpm test` green.
