# F-1 — Whole-foods database (curated generic basics) — Design

- **date:** 2026-05-23
- **roadmap:** F-1 (triage); pairs with F-5 (micronutrients, still deferred)
- **branch:** `claude/f1-whole-foods`
- **status:** specced (awaiting user review before writing the plan)

## Problem

Unlabeled whole foods — apples, chicken breast, rice — have no barcode, so the
OFF search/scan path can't reach them, and users must hand-enter macros every
time they want one in a recipe. Goal: seed a curated set of generic basics into
the shared ingredient library so they're searchable and usable in recipes with
correct per-100 g macros, out of the box.

## Boundary (what's in vs. out)

The discriminator is **generic vs. brand-specific**, not "has a label":

- **In (F-1 seed):** generic basic foods whose macros are a stable fact — an
  apple, chicken breast, white rice, olive oil, an egg. Raw/dry canonical form
  (rice/pasta/lentils/chicken seeded raw — that's how you weigh them into a
  recipe and it's unambiguous).
- **Out:** branded / processed / prepared / canned products whose macros vary by
  brand (a specific cereal, a sauce, canned ravioli, a protein bar). These keep
  going through OFF / barcode / manual entry.

Note rice itself ships in a labeled bag with a barcode yet is clearly *in* — its
macros are generic, so "has a label" is the wrong test.

## Scope — ~240 items

| Category | ~count | Examples |
|---|---|---|
| Vegetables | ~50 | tomato, onion, carrot, spinach, broccoli, pepper, courgette |
| Fruits | ~35 | apple, banana, orange, strawberry, melon, grape |
| Fresh herbs/aromatics | ~12 | garlic, parsley, cilantro, basil, ginger |
| Meat & poultry | ~30 | chicken breast/thigh, beef cuts, pork, turkey, lamb |
| Fish & seafood | ~25 | salmon, tuna, cod, hake, prawns, mussels |
| Eggs & basic dairy | ~15 | egg, whole/skim milk, plain yogurt, butter, basic cheeses |
| Grains & starches (dry) | ~25 | white/brown rice, pasta, oats, flour, couscous, quinoa, bread, potato |
| Legumes (dry/plain) | ~15 | lentils, chickpeas, black beans, peas |
| Nuts & seeds | ~15 | almond, walnut, peanut, chia, sunflower seed |
| Fats & basic pantry | ~15 | olive/sunflower oil, sugar, honey, salt, vinegar |

## Data source

**USDA FoodData Central — SR Legacy** dataset:

- Standard reference for *generic* whole foods ("Rice, white, long-grain, raw").
- **Public domain** — clean to bake into a public repo (BEDCA's redistribution
  terms rule it out here; nutrient values are facts regardless).
- Per-100 g; carries every field we need: energy, protein, carbs, fat, fiber,
  sugars, saturated fat.

**Numbers are never typed from memory.** They are extracted from the dataset by a
build script (below) so every value traces to a USDA FDC id.

A handful of Spanish-specific staples (merluza, certain cheeses) are better
characterized in BEDCA, but its license keeps it out. USDA has close generic
equivalents for nearly all; any genuine gap maps to the nearest generic entry and
is flagged in the data file. Not a blocker.

## Decisions

### D-1 — Bilingual names: additive `name_en` column (no refactor)

Mirror the `exercises` (R-19) pattern, reusing the existing `name` as the
ES-primary (the `name_es` role) rather than renaming anything:

- `ALTER TABLE ingredients ADD COLUMN name_en text null;` — purely additive.
  Existing OFF/manual rows leave `name_en` null and behave exactly as today
  (display falls back to `name`).
- Whole-food seeds populate both `name` (ES) and `name_en`.
- Only two code spots gain a `name_en` branch (search OR-clause + a display
  helper). No data migration, no churn in recipe/diary/OFF paths.

Rejected: renaming `name`→`name_es` (large refactor touching every ingredient
display/search/form/OFF path for no benefit — branded products read the same in
both locales).

### D-2 — Provenance lives in the data file, not the DB (option A)

Seed rows are `source = 'system'`, `external_id = null`. The FDC id for each food
lives in the curated data file (`foods.json`) as the auditable provenance record.
This matches the exercises system seed exactly (system rows, no `external_id`,
re-run idempotency via a `where source='system'` guard).

Rejected: adding `source = 'usda'` + widening `ingredients_external_consistency`
to store the FDC id in the DB (more faithful for future re-sync, but more schema
surface than v1 warrants).

### D-3 — `unit_type = 'gram'`, per-100 g

You weigh rice/chicken/apple in grams when building a recipe, so per-unit isn't
needed. Consistent with OFF imports.

### D-4 — Macros only; micros stay deferred (F-5)

Seed the 5-field core (kcal/protein/carbs/fat/fiber) + the U-1 sub-macros
(sugar, saturated fat). Sub-macros are `null` where USDA lacks them — never 0
(U-1 invariant: a missing value must not assert "sugar-free"). The `Macros` core
stays 5-field; the micronutrient store is designed later with F-5.

## Schema (one migration)

```sql
alter table public.ingredients add column if not exists name_en text null;

create index if not exists idx_ingredients_name_en_trgm
  on public.ingredients using gin (name_en extensions.gin_trgm_ops)
  where name_en is not null;

-- Guarded seed (~240 rows). Re-running is a no-op.
do $$
begin
  if not exists (select 1 from public.ingredients where source = 'system') then
    insert into public.ingredients
      (name, name_en, unit_type, kcal_per_unit, protein_g_per_unit,
       carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit,
       sugar_g_per_unit, saturated_fat_g_per_unit,
       is_verified, created_by_user_id, source)
    values
      -- generated by scripts/whole-foods/build-seed.ts
      ...
  end if;
end $$;
```

- RLS: no new policies — `source='system'` / `created_by_user_id=null` rows are
  already covered by the post-R-01 ingredient policies (world-readable,
  immutable, owned by nobody).
- Metric-only invariant: USDA values are already per-100 g metric.

## Data pipeline (in the worktree)

- `scripts/whole-foods/foods.json` — curated source of truth, one entry per food:
  `{ fdc_id, name_es, name_en, category }`. Human-auditable; holds provenance.
- USDA SR Legacy bulk file downloaded locally — **gitignored**, build input only.
- `scripts/whole-foods/build-seed.ts` — joins `foods.json` to the dataset by
  `fdc_id`, extracts per-100 g fields, emits the seed migration SQL. Re-runnable;
  the migration is the committed artifact, the bulk file is not.

## Code touchpoints (small)

- `searchLocalIngredients` (`features/ingredients/api.ts`): add
  `name_en.ilike.%q%` to the existing `.or(...)` clause. Ordering unchanged.
- New `ingredientDisplayName(ing, lang)` helper (mirrors `exerciseDisplayName`):
  EN → `name_en ?? name`; ES → `name`. Applied at ingredient display sites
  (autocomplete results, recipe lines, library list).
- `Ingredient` type picks up `name_en` automatically via generated types.
- Recipe building: unchanged — the autocomplete already searches the whole pool
  via `searchLocalIngredients`, so seeded whole foods appear automatically with
  no "add to my library" step (R-01 whole-pool discovery).

## Testing

- Vitest: `ingredientDisplayName` fallback logic; `build-seed` mapping (fixture
  dataset row + `foods.json` entry → expected SQL values, incl. null sub-macros).
- Manual spot-check: ~10 generated rows vs the USDA web entries before merge;
  verify whole foods surface in the recipe autocomplete in both ES and EN on the
  develop preview.

## Untouched

Micros (F-5, deferred), the `Macros` core (still 5-field), OFF/manual/diary
paths, RLS.

## Open follow-ups (not in this scope)

- F-5 micronutrients — designed later with its own nutrient store; F-1's USDA
  source already carries micro data, so re-running an extended build is the
  natural path.
- Auto-reaper / dedup (R-01 Phase 2) — system seeds are verified and surface
  first, so they're the canonical entry a future dedup would prefer.
