# R-33 wave 6 — Ingredientes

**Status:** approved (Gonzalo, 2026-07-12). Implements §6 wave 6 of the R-33 UI
redesign spec, and **corrects two of its factual claims** (below). Takes R-33's
**third** sanctioned schema exception: a salt column.

Canvas artboards (read-only, `/mnt/d/dev/claude-design-hudson-fitness`):
`ingredientes-mobile.jsx`, `ingredientes-mobile-detail.jsx` (method picker,
scanner, create, edit), `ingredientes-web.jsx` (`IngredientesWebV2`),
`ingredientes-editor-web.jsx` (method picker, create, edit).

## 1. Two corrections to the R-33 spec

- **"auto-kcal … (exist since U-1)" is wrong.** Sub-macros exist since U-1;
  **auto-kcal does not exist at all** — `kcal_per_unit` is a plain number the
  user types. The canvas computes it from the macros and lets the user override
  it. This wave *builds* that; it is not a restyle.
- **"no `is_verified` on ingredients — R-43" is wrong.** `ingredients.is_verified`
  exists (baseline schema) and is already load-bearing: both ingredient searches
  `order('is_verified', desc)`, so verified rows sort first. The **badge**
  therefore costs no migration and ships in this wave.

## 2. Schema amendment — salt

The canvas's editor has a salt field; the column does not exist. Salt is a real
nutrition fact, OpenFoodFacts carries it, and it fits the existing sub-macro
pattern exactly.

```sql
alter table public.ingredients
  add column salt_g_per_unit numeric(6,2)
    check (salt_g_per_unit is null or salt_g_per_unit >= 0);
```

**Nullable, and `null` means UNKNOWN — never 0.** This is the U-1 rule and it is
not negotiable: `sugar_g_per_unit` and `saturated_fat_g_per_unit` already work
this way, `ingredientToForm` maps `null` → blank (not `"0"`), and
`core/subMacros.ts` tracks `{ known, missing }` so the UI can say "≥" when a
value is unknown. Salt follows suit.

Ingredients are written by **direct table writes** under RLS (there is no
`save_ingredient` RPC — `createManualIngredient`, `importIngredientFromOFF` and
`updateIngredient` are plain inserts/updates; the two-write create is a known,
documented, accepted non-atomicity). So this migration is **column-only**: no
RPC to recreate, no RLS change.

The OFF client (`src/lib/openfoodfacts.ts`) maps `salt_100g` into the imported
product, preserving `null` when OFF has no value.

**Scope limit — salt is NOT aggregated.** `core/subMacros.ts` (sugar + satFat)
feeds recipe and Diario totals. Salt stays an **ingredient-level fact**: shown in
the ingredient editor and its preview, stored, imported from OFF — and not rolled
up into recipe/day totals. Aggregating it would ripple through recipes, Diario,
Progreso and the frozen macro core for no benefit this wave asked for. If a daily
salt target is ever wanted, that is a roadmap item.

## 3. Auto-kcal

New behaviour, client-side only, **no schema flag**:

- While the user edits protein/carbs/fat, `kcal` is derived (Atwater: `4P + 4C +
  9F`) and the field renders as read-only with the canvas's `auto` chip.
- If the user edits kcal directly, the field becomes theirs: auto stops
  overwriting it, and the `auto` chip goes away. The canvas shows no way back to
  auto — this wave adds an explicit affordance to return to it (a small "volver a
  automático" action), because otherwise the state is a one-way trap the user
  cannot understand or undo.
- **An imported OFF product's kcal is never overwritten.** OFF's kcal routinely
  disagrees with Atwater by ±20% (rounding, fibre, polyols, sugar alcohols), and
  the label is the truth. Import lands as user-owned kcal, not auto.

**No `kcal_is_manual` column.** Auto-vs-manual is a property of the *editing
session*, not of the stored ingredient — the stored row is just a number, and
that is honest. The derivation is a pure helper with Tier-1 tests, living beside
`core/macros.ts`.

## 4. Cut from the canvas (decided)

- **Categoría.** The canvas's category select has no column, no vocabulary, and
  nothing truthful to backfill onto the ~900 system ingredients. **Cut this wave;
  recorded as a roadmap item** so it can be picked up deliberately (it needs a
  taxonomy decision, not just a column).
- **The "marcar como verificada" toggle.** Ingredients are a **shared pool**: the
  row you would be verifying may be someone else's, and marking it verified is a
  *global* claim about their data. There is no RLS policy and no RPC governing
  who may set `is_verified`, and today nothing writes it. Shipping a toggle would
  be shipping an ungoverned write to shared data. **The read-only badge ships;
  the toggle does not.** Making it writable is a permissions decision (who may
  verify what), not a UI one → roadmap.
- **"aportado por la comunidad · últ. 2023"** — no OFF import-date column. Cut.
- **The `bedca` source badge.** `source` allows four values
  (`manual|openfoodfacts|bedca|system`) and today `bedca` silently renders as
  "Manual". No row is `bedca` in practice. Fold it into the **base** badge
  (alongside `system`) rather than inventing a fourth, and make the mapping
  exhaustive so a future `bedca` import is not mislabelled.

## 5. Routes — create/edit becomes a page

Today **there is no ingredient route beyond the list**: create and edit are both
a Radix `Dialog` (`IngredientDialog`) rendered inline by `IngredientesPage`. The
canvas designs a method-picker screen and full-page editors.

| Route | Today | After |
|---|---|---|
| `/recipes/ingredients` | list (+ dialog) | list |
| `/recipes/ingredients/new` | — | method picker (manual / OFF / barcode) |
| `/recipes/ingredients/new/manual` | — | the editor, empty |
| `/recipes/ingredients/scan` | — | the full-screen scanner |
| `/recipes/ingredients/:id/edit` | — | the editor, loaded |

**`IngredientDialog` cannot simply be deleted.** Two shipped surfaces depend on
its inline create-then-select contract:
- `IngredientAutocomplete` (recipe editor) renders it with `defaultName={query}`
  + `onSaved={(ing) => onSelect(ing)}` — create an ingredient mid-recipe and it
  is selected into the row you were filling.
- `AddIngredientSheet` (wave 5, mobile) **deliberately has no create path**; its
  own docblock names wave 6 as the owner: *"there is no create-ingredient route
  to send a thumb to … Creating from here is wave 6's to wire."*

So: the routes are the primary surface, and the **inline create-and-return must
keep working** — either by keeping a slim dialog for that one job, or by routing
with a return-to intent. Whichever is chosen, `onSaved`'s guarantee (the caller
gets the created `Ingredient` back and selects it) must survive, and wiring
create-from-`AddIngredientSheet` closes wave 5's deliberate gap.

## 6. Surfaces

**List.** Search, the mobile scan banner, rows with the macro triad (mobile) /
the numeric table (web — kcal, P, C, G, fibra), the **source badge** (base /
manual / O.F.F.) and the **verified check**. Filter chips (mi biblioteca /
verificadas / por unidad / base / mías) with counts. The canvas designed **no
empty state, no pagination and no skeleton** — build all three (the existing
`PaginationBar` + `usePagination` are shared with Recetas and Ejercicios; do not
fork them).

**Full-screen search (D-F24).** The canvas has no ingredient search artboard.
Clone the established pattern (`RecetaBuscarMobile` / `DiarioBuscarMobile`):
active field, results with the matched substring highlighted, and a pinned escape
hatch — here "crear un ingrediente nuevo" / "escanear el código". The
match-highlighter exists three times in the canvas; port it once, shared.

**Method picker.** Three cards. Mobile promotes **scan** first; web puts the
barcode entry inline (typed EAN) and states plainly that camera scanning is
mobile-only — which matches the code: the camera affordance is already gated on
`(pointer: coarse)`.

**The scanner, full-screen.** Today it is an inline `aspect-4/3` box inside a
dialog tab. It becomes a full-screen viewfinder: dark chrome, the corner-bracket
framing box (the canvas achieves the scrim with a `0 0 0 9999px` shadow, not an
overlay), the scanning laser, a glass close/torch, and the "escribir código a
mano" escape hatch. The scanner's engine is **not** rewritten: the native
`BarcodeDetector` + lazy `@zxing/browser` fallback, the EAN re-validation on
every decode, and the track teardown all stay — this is a **mounting and chrome
change**. The canvas drew only the *scanning* state; **found / not-found /
permission-denied are designed in this wave** from its vocabulary (the status
pill is the state slot), and not-found routes to the manual editor **pre-filled
with the scanned EAN**.

**The editor.** Identidad (name, brand), the unit segmented control (g / ud —
`unit_type`), the macro block with **auto-kcal**, the sub-macros (azúcares,
saturadas, fibra, **sal**), the origin card on edit (source badge + the EAN for
OFF rows, from `external_id`) and the **live preview card** (list-row replica,
big kcal, macro triad, "reparto calórico" bar). The OFF caveat line ("los valores
vienen de la comunidad; compáralos con tu envase") stays — it is honest and the
data warrants it.

## 7. Invariants

- **`core/macros.ts` and `core/subMacros.ts` are frozen** (~30 importers,
  dual-runtime Vite + Deno). Auto-kcal is a *new* pure helper beside them, not an
  edit to them.
- **`null` sub-macro = unknown, never 0.** Anywhere. Including salt.
- `ingredientDisplayName(ing, lang)` is the only name renderer (bilingual).
- The `['ingredients', …]` react-query keys are read by `IngredientAutocomplete`,
  `AddIngredientSheet` and the Diario's `AddToDaySheet` — all three were
  redesigned in waves 2 and 5. Their contracts (`useLocalIngredientSearch`, the
  fields they read, the `ingredientes` i18n keys `list.perUnit` / `list.per100g`
  that the Diario reaches into) must not break.
- `hide_owned_ingredient` is a **ref drop**, not a delete (R-25). The FK from
  `recipe_ingredients` is `ON DELETE RESTRICT` — a pool row can never be removed.
  The UI must not promise deletion.
- Metric-only. All new strings ES **and** EN.

## 8. Test gate

- **Tier-3 (pgTAP):** the salt check constraint rejects a negative and accepts a
  positive value and `null`; RLS on `ingredients` is unchanged.
- **Tier-1:** the auto-kcal helper (Atwater, rounding, the override rule); the
  OFF mapping preserves `null` salt.
- **Tier-2:** the ingredients surface has **almost no component tests today** —
  no test for `IngredientesPage`, `IngredientDialog` or `IngredientList`; the one
  scanner test stubs the scanner out entirely, so the camera path has **zero**
  coverage. The redesign lands with tests for the list, the editor (auto-kcal and
  its override, salt round-trip), the method picker, and the scanner's *states*
  (mock the detector — do not attempt a real camera in jsdom).
- **Real-browser pass, mandatory** (mobile + desktop, light + dark). jsdom applies
  no CSS: wave 5 shipped a dropdown clipped to invisibility with a green suite.
  The scanner in particular cannot be judged from tests at all.

## 9. Deployment note

The salt migration must be applied to the live project (via the Supabase MCP —
`apply_migration`, then verify) as the other two R-33 migrations already were.
CI's `db-test` job builds the DB from scratch and gates `develop` regardless.
