# R-36 — Structured recipe steps + private notes

**Date:** 2026-07-18
**Thread:** R-36 (split; per-step photos deferred to R-36b)
**Type:** schema + RPC + editor/detail UI

## Problem

A recipe's method is a single free-text column, `recipes.instructions`. The
detail page renders it as a fake numbered "step 1" (`whitespace-pre-line`) and
the editor edits it as one `<Textarea rows={6}>`. Both sites carry a comment
naming R-36 as the replacement. There is no way to reorder a step, and no way to
attach anything to an individual step — which is what per-step photos (R-36b)
will need.

Separately, a user has nowhere to write a private remark about a recipe ("sale
mejor con menos sal"). Recipes are a **shared pool** (R-01): a user's library is
a row in `user_recipe_refs`, and that row may point at someone else's recipe.
So a note cannot live on the recipe.

## Scope

**In:** structured, reorderable steps (text only); private per-user notes.
**Out:** per-step photos, the "Fotos de los pasos" setting, and everything
Supabase Storage — those are **R-36b**, which is pointless without the bucket
decision (cost/limits) still open.

## Decisions

1. **`recipe_steps` starts empty for everyone.** No migration of existing
   `instructions` text (approved: start clean, not migrate-and-retire). The app
   has no real users yet, so there is nothing to preserve.
2. **`recipes.instructions` is dropped** in the same migration, along with its
   editor textarea and detail Card. One code path, no dead column.
3. **A step is text only** — no duration, no title. R-36b touches the table
   anyway for `photo_url`; richer fields wait for a screen that consumes them.
4. **Reorder via ↑/↓ buttons**, not drag-and-drop. No DnD library exists in the
   repo, and dragging fights form scroll on mobile — where the standing rule
   says mobile wins.
5. **Notes are edited inline on the detail page**, not behind a panel. They are
   read often (while cooking) and written briefly.

## Design

### Schema — `recipe_steps`

Mirrors `recipe_ingredients` exactly.

| column | type | notes |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `recipe_id` | `uuid` | FK → `recipes(id)` `on delete cascade` |
| `display_order` | `int` not null | array index at save time |
| `text` | `text` not null | trimmed, non-empty |

Index on `(recipe_id, display_order)`.

**RLS** — same shape as `recipe_ingredients`, gated through the parent recipe's
`created_by_user_id`:

- `SELECT`: open to any authenticated user (recipes are a shared pool).
- `INSERT` / `UPDATE` / `DELETE`: only when the parent recipe's
  `created_by_user_id = auth.uid()`, excluding `LIBRARY_ANON_OWNER_ID`
  (`00000000-…-a0a0`) — a user holding a ref to someone else's recipe cannot
  write its steps.

Same migration: `alter table recipes drop column instructions`.

### RPC — `save_recipe` gains `p_steps jsonb`

Goes from 8 to 9 arguments. Per the established pattern, the migration `DROP`s
the previous overload before `CREATE`ing the new one, so PostgREST does not see
an ambiguous signature. Steps are **delete-and-reinsert** against
`recipe_steps`, exactly like ingredients, with `display_order` = array index.
Stays `security invoker` with `set search_path = public`.

### Notes — no RPC

`user_recipe_refs.note` is an existing, unused `text` column with RLS
`auth.uid() = user_id`. It is a **single-table** mutation, so a plain PostgREST
`update` is correct — hard invariant 3 requires an RPC only for atomic
multi-table mutations. This also preserves what the original migration header
calls the PII firewall: the note column physically cannot appear on the pooled
`recipes` row.

A note exists only where a `user_recipe_refs` row exists — i.e. only for
recipes in your library, which is exactly the intended availability, including
for recipes you did not create.

### Editor — `RecipeEditorForm`

The instructions textarea is replaced by a second `useFieldArray` alongside the
existing ingredient rows, with stable row keys (same pattern as `rows`). Each
step is a short textarea with ↑, ↓ and delete beside it; an "Añadir paso"
button sits below the list. The first ↑ and last ↓ are **disabled, not hidden**,
so rows do not shift while reordering. Reordering uses the hook's `swap()`.

Validation in `src/features/recipes/schema.ts`: each step is trimmed and must be
non-empty; **the list may be empty** — some recipes need no method, and forcing
one step would be noise.

`display_order` is assigned from the array index at save in `RecetaEditorPage`,
matching how ingredients already work.

### Detail — `RecetaDetailPage`

The instructions Card becomes **"Preparación"**: a real ordered list, numbered
1·2·3, in the existing Card of the two-column grid. When a recipe has no steps
the Card is not rendered at all — with one exception: the creator
(`canEditRecipe(recipe, user?.id)`) gets an `EmptyState` linking to the editor.
A user who merely holds a ref has nothing actionable to offer.

**"Mis notas" Card** sits below Preparación and renders only when the user has a
`user_recipe_refs` row for the recipe. Inline textarea; on blur, if the text
changed, it saves and shows a discreet saved indication — no button, no dialog.
Behaviour is identical for recipes the user did not create.

All new copy goes through the recipes i18n namespace in both languages; any
rendered number goes through the shared locale helpers (`formatDecimal` /
`useNum` / `{{n, number}}`), per the guard added in #209.

## Testing

- **Tier-3 (pgTAP, required on `develop`):** a non-creator holding a ref can
  `SELECT` steps but cannot insert/update/delete them; a user cannot read
  another user's `user_recipe_refs.note`; `save_recipe` replaces the step set
  and assigns `display_order` in array order.
- **Tier-2:** schema validation (empty step rejected, empty list accepted);
  reorder helpers produce the expected order; the note textarea saves on blur
  only when the value changed.
- **Real-browser pass** in Spanish, desktop + mobile, before merge — jsdom
  cannot see CSS, and this touches layout in both the editor and the detail
  grid.

## Follow-up

**R-36b** — per-step photos: adds `photo_url` to `recipe_steps`, the first
Supabase Storage bucket + upload + storage RLS + resizing, and the "Fotos de los
pasos" device-local setting. Blocked on an explicit storage/cost decision
(free-tier limits and overage) that must be brought to Gonzalo with real numbers
before recommending an option. Note that `recipes.photo_url` exists today but is
dead — never written, images are generated colour placeholders.
