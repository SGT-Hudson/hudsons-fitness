# R-33 Wave 2 — Diario Add-Flow (PR-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `MealLogDialog` logging modal with the R-33 "Añadir a hoy" flow — a bottom-sheet (mobile) / docked drawer (web): meal-slot selector, Recientes/Recetas/Alimentos tabs, a **ración step** with live macro-projection bars (fixed target line, faint already-consumed segment, this-serving segment, striped overflow, amber over-state), and a live day-balance footer — plus a full-screen navigate-only quick search. This is **PR-B of 2** for the Diario wave; PR-A (the day view) already merged (#185).

**Architecture:** All work stays in `src/features/diario/` + `src/components/ui/`. **No schema/RLS/RPC changes and no new fetches** — the ración projection is pure client-side math over data already in hand (verified):
- **Today's totals** = `sumMacros(logs.map(computeMealLogMacros))` (already in `DiarioPage`); target from `computePhaseTargets` (already there).
- **This-serving contribution** = pure helpers: `ingredientMacros(ingredient, quantity)` (ingredient row carries `*_per_unit`), `computeRecipeMacros({servings,rows}).perServing → scaleMacros(·, servings)` (recipe rows carry the ingredient tree), custom = typed numbers.
- **Mutations** unchanged: `useCreateMealLog`/`useUpdateMealLog`/`useDeleteMealLog` are single-table `meal_logs` writes. `CreateMealLogInput.source` is the `recipe|ingredient|custom` union.
- **One plumbing gap (not a fetch):** `listRecipes` already computes each recipe's `perServing` macros but discards them, keeping only `labels`. Surface `perServing` (or the raw `recipe_ingredients` rows) on `RecipeListItem`/`RecipeOption` — zero network cost — so a recipe's contribution is projectable (Task 1).
- **Drawer primitive** exists: `src/components/ui/drawer.tsx` (vaul), bottom-anchored, drag handle, already used by `ExerciseFilters`/`ExerciseInfoButton`. Use it (per repo convention: prefer shadcn/vaul over hand-rolled). For mobile-bottom + web-docked, drive vaul's `direction` responsively, or compose Drawer(mobile)/Dialog(web) behind a breakpoint like `ExerciseFilters`.

**Tech Stack:** React 18 + TS, Tailwind v4, shadcn/ui + vaul Drawer, `src/core/nutritionTone.ts`, react-hook-form + zod (existing `schema.ts` for custom validation), Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-02-r33-ui-redesign-design.md` §6.2 (Diario add-flow bullets), §5 (tone), §7 (verification). Canvas (read-only, `/mnt/d/dev/claude-design-hudson-fitness/src/`): `diario-add-mobile.jsx` (`AddSheetExplore`, `AddSheetRacion`, `MacroProjBar`, `DiarioBuscarMobile`), `diario-add.jsx` (web `DiarioAddV1`/`DiarioAddRacion`/`DiarioQuickAddV2`), `nutri-mobile-kit.jsx` (`SheetStage`, `StepperM`, `FoodDotM`/`RecipeDotM`).

## Global Constraints

- **No AI/Claude attribution anywhere** — plain conventional commits.
- All new user-facing strings in **ES and EN** (`src/i18n/{es,en}/diario.json`), key-parallel.
- No color literals (hex/`oklch(`/raw palette classes) in `src/**/*.tsx` — tokens/utilities only, including the striped overflow (`repeating-linear-gradient` uses a token color var). Grep gates stay clean. Arbitrary geometry values (`rounded-[22px]`, `left-[76%]`) are fine.
- Tone → color mapping stays per-component (mirroring `MacroBar`'s `BASE_TONE`/`EXCESS_TONE`), no shared color module.
- **No schema/RLS/RPC/`.select()` changes; no new fetch.** Reuse existing search hooks (`useRecipes`, `useLocalIngredientSearch`) and mutations. The R-32 standing rule is satisfied by reuse; if any `.select()` string is touched, stop and flag.
- Preserve behavior parity: create (recipe/ingredient/custom), edit, delete, and the undoable quick-add all keep working. No macros are denormalized into `meal_logs` (recomputed on read) — do not start storing them.
- Every task ends green: `pnpm lint` + focused test; full suite + clean `git status` before commit.

## Design decisions locked by this plan (record D-ids in the final task)

- **D-F22 — Add-flow is a vaul Drawer, replacing `MealLogDialog`.** Bottom-sheet on mobile, docked/right on web. `MealLogDialog` (Radix Dialog) is removed once the new flow covers create + edit + delete.
- **D-F23 — Ración projection is pure client-side math** (no RPC/fetch); recipe per-serving macros are surfaced from the already-fetched `listRecipes` data (Task 1), not re-fetched.
- **D-F24 — Full-screen navigate-only search scope (the one open call).** The search navigates to entity pages, but **only recipes have a detail/editor route** (`/recipes/:id`); there is **no ingredient/food detail page** (it lands in the R-33 Ingredientes wave, §6.6). Decision: the full-screen search navigates recipes → `/recipes/:id` and ingredients → the ingredients list (`/recipes/ingredients`, the best available target) with the explicit "para registrar comida usa Añadir" note; per-ingredient navigation is wired when the Ingredientes wave builds the detail page. Do NOT build an ingredient detail page in this PR (that is wave-6 scope). *This is the only item to confirm with the user before Task 6.*

---

### Task 1: Surface recipe per-serving macros (projection plumbing)

**Files:** `src/features/recipes/api.ts` (`listRecipes` / `RecipeListItem`), `src/features/diario/components/RecipeAutocomplete.tsx` (`RecipeOption`), + touch any consumer types. Tests: extend `src/features/recipes/*` macro tests or add a focused one.

**Build:** `listRecipes` already computes `computeRecipeMacros(opts).perServing` before deriving `labels` — keep the computed `perServing` (a `Macros`) on `RecipeListItem`, and expose it on `RecipeOption` (`{ id, name, servings, ingredient_count, perServing }`). Zero new query/network. This makes a recipe's per-serving macros available to the ración step without `useRecipe(id)`.

**Verify:** a unit test asserting `RecipeOption.perServing` equals `computeRecipeMacros` for a known recipe fixture; existing recipe-list tests stay green. `pnpm lint` + tests.

---

### Task 2: `MacroProjBar` primitive

**Files:** create `src/features/diario/components/MacroProjBar.tsx` (+ test).

**Build (canvas `MacroProjBar`, `diario-add-mobile.jsx`):** prop-driven, pure. A bar with a **fixed target line at `TX = 76%`** (`x = v => min(100, v/target*76)`), track `--bg-sunken`. Three segments: (1) already-consumed `base` at `opacity 0.32` in the macro color; (2) this-serving `added` (solid macro color, capped at TX); (3) **striped overflow** only when `total > target` — `border` + `repeating-linear-gradient(-45deg, {danger} 0 2px, transparent 2px 5px)` in a danger token color (no literal — use a CSS var). Floating `+{added} g` label over the added segment; an `↑ {over} g de más` pill when over. Axis labels `{base}` / `obj {target}`. Colors from macro identity (`--macro-*`) + a danger/over token; no color literals.

**Verify:** unit tests for segment widths (under vs over target), the fixed 76% line position, the striped-overflow branch appearing only when over, and the over pill text. `pnpm lint` + tests.

---

### Task 3: `AddToDaySheet` — explore step (drawer shell + slot selector + tabs + results + balance footer)

**Files:** create `src/features/diario/components/AddToDaySheet.tsx` (+ test); may extract small subcomponents (`MealSlotSelector`, `AddResultRow`) in the same folder.

**Build (canvas `AddSheetExplore`):** a vaul `Drawer` (bottom on mobile, docked/right at md+). Header "Añadir a hoy" + date/phase subline + close. **Meal-slot selector**: 4 slots (desayuno/comida/merienda/cena) with each slot's current kcal subtotal, selected slot highlighted (accent-soft + accent border). Search box + a barcode affordance placeholder (barcode scan is existing U-2 — reuse its entry if trivial, else a disabled/omitted chip; do not rebuild the scanner). **Tabs Recientes / Recetas / Alimentos**: Recientes ← the existing quick-add list (`buildQuickAddList`/`useQuickAddRecipes`); Recetas ← `useRecipes`; Alimentos ← `useLocalIngredientSearch` (debounced, search-on-type per U-7). **Result rows** (`AddResultRow`): avatar (recipe vs food), name, per-serving kcal + brand/serving line, an add/select affordance → advances to the ración step (Task 4). **Live-balance footer**: "Balance de hoy" + a consumed/target bar + remaining readout, from the page's `totals`/`targets`.

**Verify:** tests for slot selection state, tab switching changing the list source, and a result-row select firing the step transition. Mock the data hooks (component test env has no supabase — mock per repo convention). `pnpm lint` + tests.

---

### Task 4: Ración step + create wiring (incl. custom entry)

**Files:** extend `AddToDaySheet.tsx` (or a sibling `RacionStep.tsx`) (+ test).

**Build (canvas `AddSheetRacion`):** on selecting an item, show the ración step — item header + "volver a explorar", a **½-step stepper** (`StepperM`; recipe→servings, ingredient→quantity in g/unit), projected kcal `{todayKcal + itemKcal*qty}` vs target with "quedan X" / "te pasas X" (amber), and a **`MacroProjBar`** (Task 2) per P/C/G driven by pure math: `base` = today's per-macro total, `added` = this-serving contribution (`ingredientMacros`×qty / recipe `perServing`×servings / custom typed), `target` = phase target per macro. **Amber over-state** alert row when projected kcal > target. CTA "Añadir a {meal}" → `useCreateMealLog` with the right `source` union, then close + toast. **Custom entry**: a "crear personalizado" path (from the Alimentos tab or a small affordance) rendering the existing custom fields (name + kcal/P/C/G/fiber, reuse `schema.ts` custom validation) and projecting from the typed numbers.

**Verify:** tests — projected totals for a recipe/ingredient/custom selection match the pure helpers; over-state appears past target; CTA calls `create.mutateAsync` with the correct source shape; custom validation still blocks empty name/kcal. `pnpm lint` + tests.

---

### Task 5: Rewire triggers + edit/delete + remove `MealLogDialog`

**Files:** `src/pages/DiarioPage.tsx`, `src/features/diario/components/MealSection.tsx`, `QuickAddStrip.tsx`, `MealLogEntry.tsx`; delete `MealLogDialog.tsx` (+ its now-orphaned bits) once parity is covered; update `DiarioPage.test.tsx`, `MealSection.test.tsx`, `QuickAddStrip.test.tsx`.

**Build:** point the meal-card `+`, quick-add "Añadir receta", and header "Añadir comida" at the new `AddToDaySheet` (single instance in `DiarioPage`), passing the right initial meal slot (fix the header's hardcoded `'breakfast'` → the sheet's slot selector defaults to the current/first empty meal or an explicit choice). **Edit**: `MealLogEntry`'s edit opens the sheet in edit mode — reuse the ración step for recipe/ingredient (locked kind, editable qty) and custom fields for custom, calling `useUpdateMealLog`; **delete** stays (confirm → `useDeleteMealLog`). Preserve the undoable quick-add chip behavior (untouched). Remove `MealLogDialog` and confirm no dangling imports.

**Verify:** trigger tests open the new sheet with the correct slot; edit pre-fills and updates; delete works; full suite green. `pnpm lint` + `pnpm build` + tests.

---

### Task 6: Full-screen navigate-only search + docs — DEFERRED (D-F24)

> **Deferred to the R-33 Ingredientes wave (§6.6)** by user decision on 2026-07-11: the search navigates to entity pages, but ingredients have no detail page until that wave, so building a degraded ingredient→list version now and reworking it later is wasted motion. Logging is fully served by `AddToDaySheet` (Tasks 1-5), so nothing is blocked. D-F22/D-F23 were recorded in `docs/decisions.md`; D-F24 records the deferral. PR-B ships as Tasks 1-5.


**Files:** create `src/features/diario/components/QuickSearchOverlay.tsx` (or a route) (+ test); `src/app/router.tsx` if a route is cleaner; `docs/decisions.md` (D-F22–D-F24).

**Build (canvas `DiarioBuscarMobile`, per D-F24):** a full-screen search that **navigates, never logs** — searching recipes (`useRecipes`) and ingredients (`useLocalIngredientSearch`); selecting a recipe → `navigate('/recipes/:id')`, an ingredient → `navigate('/recipes/ingredients')` (best available until the Ingredientes wave adds a detail page). Explicit note "El buscador abre la página. Para registrar comida usa Añadir." Wire its entry point (e.g. the search field in the shell / a header search). **Confirm D-F24 with the user before building this task.** Record D-F22/23/24 in `docs/decisions.md`.

**Verify:** test that selecting a result calls `navigate` (not a mutation) with the right path; the "usa Añadir" note renders. `pnpm lint` + `pnpm build` + full `pnpm test` green; grep gates clean; visual QA per spec §7.

---

## Verification (whole PR-B, per spec §7)

- `pnpm lint && pnpm build && pnpm test` green; grep gates clean; ES/EN key-parallel.
- Visual pass at 390px and ≥1280px (agent-browser + seeded qa-bot): open the sheet from each trigger, pick a recipe/ingredient/custom, watch the projection bars (a serving that overshoots → striped overflow + amber CTA), add it and see the day update; edit + delete an entry; open the full-screen search and confirm it navigates (never logs).
- No `.select()`/schema drift; mutations still single-table.

## Ship

Worktree `.claude/worktrees/r33-wave2-diario-addflow`, branch `claude/r33-wave2-diario-addflow`, squash-auto-merge to `develop` when CI green. Teardown on merge. Release to `main` batches with the nutrition waves per spec §8. After PR-B: waves 3-9 (Planificador → Ajustes+Más).
