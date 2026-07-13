# Decimal-comma input — plan

Spec: `docs/superpowers/specs/2026-07-13-decimal-comma-input.md` (read it — it is
the contract; this plan only sequences it).

Fixes a **live data-corruption bug**: `<input type="number">` silently turns
`1,2` into `12`, reaching **body weight**. The comma is what a Spanish keyboard
types by default.

## Global Constraints

Binding on every task. A violation is a failed review.

1. **The browser strips the comma before JS sees it.** `type="number"` hands back
   `"12"` for `1,2`. So the DOM element MUST change to `type="text"
   inputMode="decimal"` — no schema-level fix can work. If you find yourself
   "fixing" this in zod alone, you have not fixed it.

2. **`valueAsNumber` on `"1,2"` returns `NaN`.** Any field migrated to
   `type=text` MUST drop `valueAsNumber` / bare `setValueAs: Number` and move to
   a string-in schema, or it will break loudly (or worse, silently null out).

3. **Blank semantics are load-bearing and MUST NOT change.** The feature-local
   parsers differ **on purpose** and their differences are pinned by existing
   tests:
   - ingredients `nonNegNumberFromString`: blank → **0**
   - ingredients `fiberFromString`: blank → **0**
   - ingredients `optionalNonNegFromString`: blank → **null**; garbage → an
     **error**, not null
   - diario `parseOptionalNumber`: blank/non-finite → **null**
   A comma-aware parser changes **what parses**, never **what blank means**.
   `null` sub-macro = UNKNOWN, never 0 — that invariant is untouched by this work.

4. **Accept-both, emit-point. NOT locale-aware.** `parseDecimalInput` accepts `,`
   or `.` unconditionally. A locale-dependent parser is a footgun: a user
   switching ES→EN would change how their own stored data parses. Prefill stays
   `String(n)` (point-decimal) at all 7 prefill sites — **do not touch them**.

5. **Ambiguity is rejected, not guessed.** `"1,2,3"`, `"1.2,3"`, `"1,234.5"` →
   `null`. Do not try to infer a thousands separator.

6. **Scope: decimals only** (Gonzalo's call — `type=text` loses the desktop
   spinner). Integer-by-schema fields (series, reps_min, reps_max, rest_seconds,
   servings/raciones, warm-up reps) **keep `type="number"` and are not touched**.
   For a field not explicitly listed in the spec: fraction-capable → `NumberField`;
   integer by definition → keeps the spinner. State the call per field.

7. **The native `required` / `min` / `max` gates stop working on `type=text`** —
   the zod schema must take over. This is deliberate and closes two known
   defects: native `required` currently preempts the zod message with an
   unexplained browser bubble, and `MacroField`'s hardcoded `max={100}` blocks a
   legitimate save on a `unit_type='unit'` ingredient (where a macro can exceed
   100 g). **Every field that loses a native gate must gain the zod equivalent** —
   a field that silently becomes submittable-blank is a regression.

8. **`src/core/macros.ts` and `src/core/subMacros.ts` are FROZEN.**
   `fractionToPct` / `pctToFraction` (`src/lib/macros.ts`) keep owning the R-06
   percent↔fraction conversion — `parseDecimalInput` runs **before** them, never
   instead of them.

9. **jsdom cannot see this bug at all.** It does not implement `type="number"`'s
   comma-stripping, so a comma test passes in jsdom *even against the broken
   code*. **A green suite proves nothing here.** The real-browser pass (Task 5) is
   the only acceptance. Every task must say what it could not verify.

10. Public repo: **no AI/Claude attribution anywhere**. Plain conventional
    commits. Any new user-facing string in ES **and** EN.

## Tasks

### Task 1 — The boundary: `parseDecimalInput`, `NumberField`, and `src/lib/zod.ts`

The foundation. Lands alone; everything else builds on it.

- **`src/lib/number.ts`** → `parseDecimalInput(s: string): number | null`. Trim;
  blank → `null` (the caller's schema decides if blank is legal); accept `,` or
  `.` but **not both and not more than one**; non-finite → `null`. Tier-1 tests:
  `"1,2"`/`"1.2"` → 1.2; `"1,2,3"`, `"1.2,3"`, `"1,234.5"`, `"abc"`, `""` → null;
  negatives, exponents, surrounding whitespace.
- **`src/components/ui/NumberField.tsx`** — promoted from the private `MacroField`
  at the bottom of `IngredientEditorForm.tsx` (7 call sites). **Keep its
  `forwardRef`** — it is load-bearing for `register`. Renders **`type="text"
  inputMode="decimal"`** (the numeric keypad still comes up on mobile; nothing is
  lost there). Do **not** hardcode `min`/`max`/`step` into it — those are schema
  concerns now (Constraint 7).
- **Rewire `src/lib/zod.ts`** — `requiredNumericString` / `optionalNumericString`
  call `parseDecimalInput` instead of `Number(s)`. **This fixes measurements and
  profile for free** (they already use the shared helpers), so migrate their
  inputs to `NumberField` in this task and prove it: `MeasurementDialog`'s
  `82,4 → 82.4` on **body weight** is the headline case of the whole PR.
  ⚠️ `MeasurementDialog`'s "does not submit when weight is empty" test may lean
  on the **native `type=number` gate**. After the switch, zod must produce that
  error — verify the test still fails for the right reason, and fix the schema if
  it does not.

Verify: `pnpm typecheck`, and the measurements/profile/lib suites green.

### Task 2 — The feature-local parsers (ingredients, diario, recipes)

Collapse convention (b) onto the shared helper, and swap the decimal inputs to
`NumberField`.

- **ingredients:** `nonNegNumberFromString`, `fiberFromString`,
  `optionalNonNegFromString`, `isInvalidNonNegNumber` → all onto
  `parseDecimalInput`, **preserving their blank semantics exactly** (Constraint 3
  — they are pinned by 16 tests). `MacroField` is deleted; its 7 call sites move
  to the shared `NumberField`, plus `kcal_per_unit`. **`kcal_per_unit` has the
  auto/manual `onChange` wrapper** (typing flips the mode to manual) — that
  interaction must survive; it is pinned by tests and was just shipped in wave 6.
  Removing the hardcoded `max={100}` also fixes the `unit_type='unit'` save.
  ⚠️ Ingredients' schema tests assert **"non-numeric → `invalidNumber`"** —
  check none of those fixtures is comma-shaped, or this fix would turn a
  rejection into an acceptance.
- **diario:** `num`, `parseOptionalNumber` (9 call sites in `RacionStep`) → the
  shared helper. `RacionStep`'s 5 custom-macro inputs → `NumberField`.
- **recipes:** the inline `Number(v.servings)` / `Number(row.quantity)` in
  `schema.ts`. **`servings` is an integer — it keeps `type="number"`.**
  `rows.${index}.quantity` is a decimal → `NumberField` (it is a field array;
  the `register` shape must survive). `parsePrepTimeMinutes` is integer-only and
  already correct — **do not touch it**.

### Task 3 — The `valueAsNumber` migration (phases, objetivos, training decimals)

The hard one: convention (c) has **no string boundary at all**, so a comma is
`NaN` today and cannot be reached by any parser. Migrate the **decimal** fields
to string-in schemas + `NumberField`.

- **phases** (`PhaseDialog`): `kcal_value`, `protein_g_per_kg`, **`fat_pct_input`**,
  `fiber_value`. `fat_pct_input` is **the exact field invariant 6 was written for**
  (R-06): it is a percent the user types, stored as a 0.10–0.60 fraction. A comma
  there silently multiplies the stored fraction. `fractionToPct`/`pctToFraction`
  keep owning that conversion — `parseDecimalInput` runs before them.
  **`PhaseDialog`'s R-06 test ("fat % converted to a DB fraction") must be updated
  for the `valueAsNumber` removal and must still pin the conversion.**
- **objetivos** (`ObjetivosPage`): `target_body_fat_pct`.
- **training:** `SetRow` `weight_kg` + `rpe`; `RoutineBuilder` `target_rpe`
  (0.5 steps) and the warm-up **percentage**. Their integer siblings
  (`target_sets`, `target_reps_min/max`, `rest_seconds`, warm-up reps) **keep
  `valueAsNumber` and `type="number"`** — do not touch them.
- Each migrated field's `z.number()` becomes a string-in schema. **Its min/max/
  step validation must survive as zod rules** (Constraint 7) — e.g. RPE stays
  6–10 in 0.5 steps, `target_body_fat_pct` stays 3–50.

### Task 4 — The non-RHF sites, and retiring the one-off

- **`CoachSuggestions.tsx:101`** (suggested load), **`runner/SetView.tsx:130`**
  (the `Stepper`'s `onChange={Number(e.target.value)}`), and
  **`runner/ExerciseStart.tsx:55`** (working weight — a **raw `<input>`**, not the
  `Input` component). All three are `useState` + `Number(...)`: apply
  `parseDecimalInput` at the `onChange` boundary and move them to `NumberField`.
- **Retire `ExerciseDialog.tsx:54`'s one-off** `Number(v.replace(',', '.'))` onto
  the shared helper. It is the app's only comma-aware field today — undocumented
  and single-comma-only (`.replace` without `/g`). Its *behaviour* is the one we
  are generalising, so it must keep working; it just stops being a special case.

### Task 5 — Real-browser pass and full verification

**This is the acceptance criterion. jsdom cannot see this bug** (Constraint 9) —
it does not implement `type="number"`'s comma-stripping, so the comma tests pass
even against the broken code.

- Drive a real browser under **es-ES**, mobile and desktop, light and dark. For
  each, type a **comma** and assert the **submitted payload / stored number**, not
  the field's value:
  - **body weight** `82,4` → 82.4 (the headline case)
  - an ingredient **macro** and **kcal** (and confirm auto-kcal still flips to
    manual when you type into kcal)
  - a **phase fat %** `27,5` → stored fraction `0.275` (R-06)
  - a recipe **ingredient quantity**
  - a training **weight_kg** and **RPE**
- Confirm the **numeric keypad still comes up on mobile** (`inputMode="decimal"`).
- Confirm the **integer fields kept their spinner** on desktop (series, reps,
  descanso, raciones).
- Confirm every field that **lost a native gate gained the zod one**: submit each
  migrated form blank/out-of-range and check the app's own error appears (not a
  browser bubble, and not a silent save).
- Full `pnpm lint && pnpm build && pnpm test` — run it **myself**, not on a
  subagent's report.
