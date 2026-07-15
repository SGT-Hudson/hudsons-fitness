# R-33 wave 5 — Recetas

**Status:** approved (Gonzalo, 2026-07-12). Implements §6 wave 5 of the R-33 UI
redesign spec, and amends it twice: it **adds a read view** the app never had,
and it takes a **second sanctioned schema exception** (prep time), after wave 4's
`phase_type`.

Canvas artboards: `recetas-web.jsx` (`RecetasWebV2`), `receta-editor-web.jsx`
(`RecetaVistaWebV2`, `RecetaEditorWebV2`, `RecetaCrearWebV2`),
`recetas-mobile.jsx`, `recetas-mobile-detail.jsx`. Mobile artboard = base
layout, web artboard = md+ layout.

## 1. What exists today (the gap this wave closes)

- `/recipes` — list page. Grid/list toggle (localStorage), search box, meal-type
  chips, nutrition-goal chips (U-3 labels), pagination, per-card favourite star
  (localStorage), edit + delete actions.
- `/recipes/:id` — **the editor**. There is no read view: tapping a recipe's
  name drops the user straight into edit mode. The only read-only recipe surface
  in the app is the planner's `RecipePeek` (wave 3).
- Data: `listRecipes` (via `user_recipe_refs`, computes `perServing` in memory),
  `fetchRecipe`, `save_recipe` RPC (replace-children), `hide_owned_recipe` RPC.

## 2. Routes — the read view

The wave splits read from write:

| Route | Before | After |
|---|---|---|
| `/recipes` | list | list (redesigned) |
| `/recipes/new` | editor | editor (redesigned) |
| `/recipes/:id` | **editor** | **read view (new)** |
| `/recipes/:id/edit` | — | editor |

A card in the list navigates to the read view; the read view's primary action
navigates to the editor. The planner's `RecipePeek` "ver receta completa" link
retargets from the editor to the read view. Saving in the editor returns to the
read view for an existing recipe, and to the read view of the newly-created
recipe on create (today it returns to the list).

## 3. Schema amendment — prep time

New user-facing field: **how long the recipe takes to prepare**. It does not
exist today in any form; the canvas shows it in the detail meta strip, the
recipe peek chip, and the editor's meta card.

```sql
alter table public.recipes
  add column prep_time_minutes integer
    check (prep_time_minutes is null or prep_time_minutes > 0);
```

**Nullable on purpose.** Every existing recipe predates the column and there is
nothing truthful to backfill; "no time recorded" is a legitimate permanent
state. The UI omits the stat entirely when it is null — it never renders `0`,
`—`, or guesses. Integer minutes, metric-neutral (invariant 1 is about mass and
length, this is time); the form displays minutes and stores minutes.

`save_recipe` gains `p_prep_time_minutes integer default null`. Adding a
trailing parameter changes the signature, so the 7-arg overload is **dropped and
recreated** (a defaulted trailing param would leave the old body live and make
PostgREST ambiguous — the same reasoning as U-2's `p_meal_types` and wave 4's
`p_phase_type`). It stays `SECURITY INVOKER` with `set search_path to ''`; RLS is
unchanged and remains the sole boundary; a bad value is rejected by the check
constraint, not by app code.

Unlike wave 4's `save_template`, **the param is written unconditionally on both
insert and update**, so passing `null` clears the field — which is correct here
(the user emptying the input means "no time"). The editor must therefore always
send the current value, never omit it.

## 4. Media placeholder

`recipes.photo_url` exists in the schema but is completely dead: no Storage
bucket, no upload, and `save_recipe` never writes it. Photo upload is out of
scope (bucket + RLS + upload + resize is its own thread — new roadmap item).

The canvas has no real photos either: every recipe image is a diagonal-stripe
fill whose hue is a per-recipe number. This wave ports that as a **shared
placeholder component**: the stripe fill with the **Recetas (utensils) icon
centred on it**, so it reads as a deliberate placeholder rather than a broken
image. The hue is **derived deterministically from the recipe id** (same recipe →
same colour, always). It fills the media slot in the list card, the mobile
thumbnail, and the detail hero — the same slot a real photo will occupy when
upload ships.

## 5. Instructions — "Paso 1"

The recipe has a single `instructions` text column. Structured, reorderable,
per-step-photo steps are **R-36** and are not built here.

The read view renders the existing text as **one numbered step** ("1"), using
the canvas's step-row anatomy (numbered circle + text, whitespace preserved).
This gives the designed layout without inventing structure the data does not
have, and when R-36 lands the same component renders 1, 2, 3… unchanged. The
editor keeps its single textarea — no fake reorderable step rows.

## 6. Strip-list

Stripped from the canvas (verified absent from the schema, deferred elsewhere):

- **Structured steps, step photos, step-photo settings** → R-36.
- **Private notes card.** `user_recipe_refs.note` exists but is unwritten by any
  RPC and unsurfaced by any UI. Surfacing it means touching `save_recipe` again;
  it is out of scope for this wave → new roadmap item.
- **Recipe photo upload** (see §4) → new roadmap item.
- **Recent-search history** on the mobile search screen (no store for it).
- **Per-ingredient brand line** where the ingredient has no brand field.
- **Planner-reference count in the delete confirmation** ("se quitará de 3
  celdas") — deletion is a *ref drop* (`hide_owned_recipe`, R-01/R-25), not a
  cascade; the existing copy stays.

Kept, against the original R-33 strip-list (which was written before this recon
and assumed they did not exist):

- **Favourites.** They already work (localStorage, `favorites.ts`,
  `partitionFavorites`). Removing them would be a regression. They are repainted
  per the canvas (glass star pin on the card, `Favoritas` filter chip) and stay
  device-local. Promoting them to schema is a separate decision.

## 7. Surfaces

**List (`/recipes`)** — filter chips row (Todas / Favoritas / the 5 meal types /
the existing U-3 goal chips), search, sort label, media-topped cards in a
responsive grid (canvas: 4 columns at 1920), the existing `PaginationBar`
(shared with Exercises + Ingredients — do not fork it), and a list empty state
(the canvas has none; build it from the canvas's empty-state vocabulary). The
existing grid/list view toggle is kept only if the list variant survives the
redesign; the canvas designed grid only — dropping the toggle is acceptable and
preferred to shipping an undesigned view.

Card "cutout" style is **not** a notch: it is layered elevation that lifts 2px
on hover, a 1.06 media zoom, and a 4px→7px arrow gap. All three are
`group-hover` utilities; the `CutoutCorner` SVG in the canvas is dead code.

Mobile: horizontal row cards, thumbnail left, `+ añadir al diario` CTA — which
reuses the existing wave-2 `AddToDaySheet`, not a new sheet.

**Read (`/recipes/:id`)** — hero (media placeholder + name + meal-type chip),
meta strip (raciones · tiempo · kcal/ración · nº ingredientes; tiempo omitted
when null), macros card (totals vs per-serving, per-serving highlighted) with
the kcal-share distribution bar, ingredients card (per-ración chip where
`per_serving`), Preparación card (§5), and the actions: favourite, "añadir al
día", editar.

**Editor (`/recipes/new`, `/recipes/:id/edit`)** — meta card (media placeholder,
borderless title, raciones, **tiempo**, meal-type chips), ingredients table with
the per-ración/en-total chip, inline ingredient search footer (reusing the
existing `IngredientAutocomplete` logic), live macros card + distribution bar
(empty variant before any ingredient), instructions textarea, delete.

## 8. Invariants

- `RecipeListItem.perServing` and `meal_types` are **load-bearing for other
  waves**: `AddRecipeDrawer` (wave 3) and `AddToDaySheet` (wave 2) read a
  recipe's macro contribution straight off the already-fetched list. Slimming
  `listRecipes`' select to lighten the new list page would silently break both.
- The `['recipes', …]` query keys are invalidated cross-feature. Do not rename.
- `macros.ts` is imported by ~30 files across diario/planning/templates/progreso.
  Frozen public API.
- All new strings in ES **and** EN.

## 9. Test gate

- **Tier-3 (pgTAP):** the check constraint rejects `0` and negatives and accepts
  a positive value and `null`; `save_recipe` round-trips prep time on create and
  on update, and can clear it back to `null`; the recreated RPC still enforces
  ownership on update and still replaces children.
- **Tier-1:** the media-placeholder hue derivation is deterministic per recipe
  id; prep-time form parsing/validation at the form boundary (invariant 6).
- **Tier-2:** the recipes surface has **no component tests today** (only
  `RecipesTabs.test.tsx`). The new read view, the list, and the editor get tests
  — at minimum: the list renders cards and filters them; the read view omits the
  time stat when null and renders instructions as step 1; the editor round-trips
  prep time; `router.test.tsx` covers the new `/recipes/:id/edit` split.
- Visual pass per R-33 §7 (agent-browser harness, seeded QA user), mobile and
  web.

## 10. Deployment note

This adds a **second** migration the live project is missing (after wave 4's
`phase_type`). Both must be applied before R-33 reaches `main`, through the pg
runner (`supabase db push` is unusable here — see the `live-db-migration-gap`
runbook note). CI's `db-test` job builds the DB from scratch and gates `develop`
regardless.
