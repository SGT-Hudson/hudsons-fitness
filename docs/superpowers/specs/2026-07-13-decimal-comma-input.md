# Decimal-comma input — the shared numeric form boundary

**Status:** approved (Gonzalo, 2026-07-13). A cross-cutting fix, so it gets a
spec per CLAUDE.md. It touches **hard invariant 6** ("convert units/fractions
only at the form boundary via shared helpers") — by finally making that
invariant true.

## 1. The bug

Typing a decimal **comma** into any `<input type="number">` silently corrupts
the value: `1,2` is stored as **`12`**, with `validity.valid === true` and no
warning. Confirmed in a real browser under full es-ES ICU (R-33 wave 6 browser
pass). Spanish keyboards put `,` on the numeric keypad, so **this is what a user
types by default**. It reaches **body weight**, so it is corrupting real data on
`develop` today.

**The load-bearing fact:** `type="number"` accepts only `.` as the decimal
separator, regardless of locale. The browser **strips the comma before React or
RHF ever see the value** — the input hands back `"12"`, not `"1,2"`. Therefore:

> **No zod, `setValueAs`, or schema-level `.replace(',', '.')` can fix this.**
> The DOM element itself must change.

Every existing schema is innocent. They are all correct given the string they
receive; they simply never receive the comma.

## 2. What the codebase looks like today

**Three competing conventions**, never consolidated:

- **(a) string-in, zod parses** via the shared `src/lib/zod.ts`
  (`requiredNumericString` / `optionalNumericString`) — measurements, profile.
- **(b) string-in, feature-local ad-hoc parser** — ingredients
  (`nonNegNumberFromString`, `fiberFromString`, `optionalNonNegFromString`),
  diario (`num`, `parseOptionalNumber`), recipes (bare `Number(...)` inline).
- **(c) `valueAsNumber: true` → `z.number()`, with no string boundary at all** —
  phases, objetivos, training. ⚠️ **`valueAsNumber` on `"1,2"` returns `NaN`**,
  so these cannot even be reached by a comma-aware parser until they are
  migrated to string-in.

There is **no shared `NumberField`**. `MacroField` (private, at the bottom of
`IngredientEditorForm.tsx`, 7 call sites) is an ingredient-shaped prototype of
one. The base `Input` (`src/components/ui/input.tsx`) has no numeric awareness —
it just forwards `type`.

**The prior art:** `src/features/training/components/ExerciseDialog.tsx:54` does
`Number(v.replace(',', '.'))` on a `type=text` + `inputMode="decimal"` field. It
is the **one input in the app where a Spanish user can type `2,5` and get 2.5** —
undocumented, single-comma-only (`.replace` without `/g`), and a one-off. This
spec generalises its behaviour and retires the one-off.

## 3. The fix

### 3.1 One parser, at the boundary

New `src/lib/number.ts` → `parseDecimalInput(s: string): number | null`.

- Trim. Blank → `null` (the caller's schema decides whether blank is legal).
- Accept **`,` or `.`** as the decimal separator — **not both**, and **not more
  than one** of either. `"1,2"` → `1.2`; `"1.2"` → `1.2`; `"1,2,3"`, `"1.2,3"`,
  `"1,234.5"` → `null` (invalid, not a guess). Rejecting ambiguity beats
  guessing a thousands separator wrong.
- Non-finite → `null`.

**It is NOT locale-aware, deliberately.** Accept both separators
unconditionally. A locale-dependent parser is a footgun: a user switching ES→EN
would change how their own stored data parses. The app's *display* side already
speaks decimal-comma (`Intl.NumberFormat` in `QuantityStepper`, `KcalRing`,
`diario/macros.ts`) — that stays as it is. This is **accept-both, emit-point**.

### 3.2 One component

New `src/components/ui/NumberField.tsx`, promoted from the private `MacroField`
(keep its `forwardRef` — it is load-bearing for `register`).

- Renders **`type="text" inputMode="decimal"`**. That is the whole point: it is
  the only way the comma survives to JS. `inputMode="decimal"` still raises the
  numeric keypad on mobile, so nothing is lost there.
- **The native `required` / `min` / `max` / `step` gates stop working on
  `type=text`.** The zod schema must take over. This is a feature, not a cost —
  it closes two known defects at the same time:
  - native `required` on the macro inputs currently **preempts the zod message**,
    so the user gets an unexplained browser bubble instead of the app's error;
  - `MacroField`'s hardcoded `max={100}` **blocks a legitimate save** on a
    `unit_type='unit'` ingredient, where a macro can exceed 100 g.

### 3.3 Scope — decimals only (Gonzalo's call)

Switching to `type=text` loses the desktop spinner. So it applies **only to
fields that can legitimately hold a fraction**:

**→ `NumberField` (text + `inputMode="decimal"`, comma accepted):** weight_kg ·
body_fat_pct · muscle_pct · water_pct · height_cm · the macro block (P/C/G/fibra/
azúcares/saturadas/sal) · kcal · ingredient quantity · default_increment_kg ·
RPE · kcal_value · protein_g_per_kg · fat_pct · and the non-RHF load fields
(CoachSuggestions, SetView, ExerciseStart).

**→ stays `type="number"` (with its spinner), untouched:** series · reps_min ·
reps_max · rest_seconds · raciones/servings · warm-up reps — integers by schema,
where a decimal separator has no meaning.

**The rule for a field not listed:** if its schema/DB column permits a fraction,
it is a `NumberField`; if it is an integer by definition, it keeps the spinner.
State the call per field in the PR.

### 3.4 Collapse the three conventions into one

- Rewire `src/lib/zod.ts`'s `requiredNumericString` / `optionalNumericString` to
  call `parseDecimalInput` instead of `Number(s)` → **measurements and profile
  are fixed for free**.
- Migrate the feature-local parsers (ingredients, diario, recipes) onto the same
  helper. Their **existing semantics must be preserved exactly** — they differ on
  purpose and their differences are pinned by tests:
  - `nonNegNumberFromString`: blank → **0**
  - `fiberFromString`: blank → **0**
  - `optionalNonNegFromString`: blank → **null**; garbage → an **error**, not null
  - diario `parseOptionalNumber`: blank/non-finite → **null**
  A comma-aware parser changes *what parses*, never *what blank means*.
- Migrate the **decimal** `valueAsNumber` / `setValueAs` registrations (phases,
  objetivos, the training decimals) off `valueAsNumber` to string-in schemas.
  This is the bulk of the real work and it is what actually collapses (c) into
  (a). Integer fields may keep `valueAsNumber`.
- Retire `ExerciseDialog.tsx:54`'s one-off `.replace(',', '.')` onto the shared
  helper.

### 3.5 What does NOT change

- **Prefill stays `String(n)`** — point-decimal, locale-independent, all 7
  prefill sites (`ingredientForm.ts`, `MeasurementDialog`, `RecipeEditorForm`,
  `RacionStep`, `OnboardingPage`, `SettingsBiometricsPage`, auto-kcal's
  `setValue`). Accept-both/emit-point means **zero changes** to any of them, and
  it cannot regress the round-trip.
- Display formatting (`Intl.NumberFormat`, `toLocaleString`) is untouched.
- `src/core/macros.ts` and `src/core/subMacros.ts` stay **frozen**.
- `fractionToPct` / `pctToFraction` (`src/lib/macros.ts`) keep owning the R-06
  percent↔fraction conversion. `parseDecimalInput` runs *before* them, not
  instead of them.

## 4. Test gate

- **Tier-1:** `parseDecimalInput` — `"1,2"`/`"1.2"` → 1.2; `"1,2,3"`, `"1.2,3"`,
  `"1,234.5"`, `"abc"`, `""` → null; negatives, exponents, whitespace.
- **Every migrated schema keeps its existing tests green** — especially the
  blank-means-0-vs-null distinctions (§3.4) and ingredients' "non-numeric →
  `invalidNumber`" fixtures (**check none of those fixtures is comma-shaped**,
  or the fix would turn a rejection into an acceptance).
- **New:** for each migrated feature, one test that types a **comma** and asserts
  the *stored number*, not just the field value. `MeasurementDialog`'s
  `82,4 → 82.4` is the headline case.
- **`PhaseDialog`'s R-06 test** ("fat % converted to a DB fraction") must be
  updated for the `valueAsNumber` removal and must still pin the conversion.
- `MeasurementDialog`'s "does not submit when weight is empty" may currently lean
  on the **native `type=number` gate**. After the switch, zod must produce that
  error. Verify the test still fails for the right reason.
- **No test queries by `role="spinbutton"`** (verified: zero hits repo-wide), so
  the `type` switch breaks no selector.
- **Real-browser pass, mandatory** (es-ES ICU): type `1,2` into a `NumberField`
  and confirm the *submitted payload*. jsdom does not implement `type="number"`'s
  comma-stripping at all, so **jsdom literally cannot see this bug** — a green
  suite proves nothing here. Drive body weight, a macro, and a phase percentage.
