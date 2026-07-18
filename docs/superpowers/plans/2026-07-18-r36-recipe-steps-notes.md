# R-36 Structured Recipe Steps + Private Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `recipes.instructions` column with a structured, reorderable `recipe_steps` child table, and surface per-user private notes stored on the existing `user_recipe_refs.note` column.

**Architecture:** `recipe_steps` mirrors `recipe_ingredients` exactly (same shape, same RLS gating through the parent recipe's `created_by_user_id`, same delete-and-reinsert inside `save_recipe`). Notes bypass the RPC entirely — `user_recipe_refs` is a single table with `auth.uid() = user_id` RLS, so a plain PostgREST update is correct. The editor gains a second `useFieldArray` with ↑/↓ reorder buttons; the detail page renders a real ordered list plus an inline notes Card.

**Tech Stack:** Postgres/Supabase migrations + pgTAP, PostgREST via supabase-js, React 18 + react-hook-form + zod, TanStack Query, Tailwind + shadcn/ui, i18next, Vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-18-r36-recipe-steps-notes-design.md`.
- **Worktree:** `/home/hudson/dev/hudsons-fitness/.claude/worktrees/r36-recipe-steps-notes`, branch `claude/r36-recipe-steps-notes`. All commands run from there.
- **Metric-only** units; DB is canonical; RLS is the sole security boundary.
- **`security invoker`** on every function, and `set search_path to ''` with fully-qualified `public.` names — copy the style of `supabase/migrations/20260712120000_r33_recipe_prep_time.sql`.
- **Signature changes to `save_recipe` require `drop function if exists` of the exact old signature before `create or replace`** — otherwise PostgREST sees an ambiguous overload.
- **`LIBRARY_ANON_OWNER_ID`** is the inline literal `'00000000-0000-0000-0000-00000000a0a0'` in SQL; the TS mirror is `src/core/library.ts:35`.
- **No AI/Claude attribution** anywhere — plain conventional commits.
- **Numbers in the UI** go through the shared locale helpers (`formatDecimal` / `useNum` / `{{n, number}}`); a lint guard enforces this.
- **i18n:** every new string gets both `src/i18n/es/recetas.json` and `src/i18n/en/recetas.json`. The `recetas` namespace is already registered — do not touch `src/i18n/index.ts`.
- **Gates before merge:** `pnpm lint`, `pnpm build`, `pnpm test` all green, plus the Tier-3 pgTAP job.

## Deviation from the spec (read before Task 2)

The spec says `save_recipe` "goes from 8 to 9 arguments". That assumed `p_instructions` stays. Since the same migration **drops** `recipes.instructions`, the parameter must go too: the RPC loses `p_instructions` and gains `p_steps`, so it stays at **8 arguments** with a different signature. The plan implements the 8-argument version.

The spec also does not mention **`RecipePeek`** (`src/features/planning/components/RecipePeek.tsx:169-176`), a third consumer that renders `recipe.instructions` in the planner. Task 9 updates it — dropping the column without it would not compile.

## File Structure

**Created**
- `supabase/migrations/20260718100000_r36_recipe_steps.sql` — table, RLS, index.
- `supabase/migrations/20260718100100_r36_save_recipe_steps.sql` — RPC signature swap + `drop column instructions`.
- `supabase/tests/08_recipe_steps.test.sql` — pgTAP: RLS + RPC behaviour.
- `src/features/recipes/notes.ts` — note fetch/update API (separate from `api.ts`: different table, different security model, and `api.ts` is already 190+ lines).
- `src/features/recipes/notes.test.ts` — unit tests for the note payload helper.
- `src/features/recipes/components/RecipeStepsField.tsx` — the editor's steps field array (kept out of `RecipeEditorForm.tsx`, which is already ~600 lines).
- `src/features/recipes/components/RecipeStepsField.test.tsx`
- `src/features/recipes/components/RecipeNotesCard.tsx` — the detail page's inline notes Card.
- `src/features/recipes/components/RecipeNotesCard.test.tsx`

**Modified**
- `src/types/database.ts` — generated types for `recipe_steps`, `recipes` (minus `instructions`), `save_recipe` Args.
- `src/features/recipes/api.ts:131-190` — `fetchRecipe` select + `saveRecipe` payload.
- `src/features/recipes/hooks.ts` — note query + mutation hooks.
- `src/features/recipes/schema.ts:88-155` — `instructions` → `steps`.
- `src/features/recipes/components/RecipeEditorForm.tsx:46-65,578-599` — state type, empty state, mapper, Card swap.
- `src/pages/RecetaEditorPage.tsx:87-125` — payload mapping.
- `src/pages/RecetaDetailPage.tsx:337-359` — Preparación Card + notes Card.
- `src/features/planning/components/RecipePeek.tsx:169-176` — steps instead of instructions.
- `src/i18n/es/recetas.json`, `src/i18n/en/recetas.json`
- `docs/data-model.md`, `docs/roadmap.md`, `docs/changelog.md`

---

### Task 1: `recipe_steps` table + RLS

**Files:**
- Create: `supabase/migrations/20260718100000_r36_recipe_steps.sql`
- Create: `supabase/tests/08_recipe_steps.test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.recipe_steps (id uuid, recipe_id uuid, display_order integer, text text, created_at timestamptz)`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/08_recipe_steps.test.sql`. Seeds mirror `supabase/tests/02_rls_child.test.sql`: user A is `1111…1111` owning recipe `…a1`, user B is `2222…2222` owning recipe `…b1`.

```sql
begin;
select * from no_plan();

-- privileged seeds (before assuming the authenticated role)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com')
on conflict (id) do nothing;

insert into public.recipes (id, name, servings, created_by_user_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'A recipe', 2, '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-0000000000b1', 'B recipe', 2, '22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

insert into public.recipe_steps (recipe_id, display_order, text) values
  ('00000000-0000-0000-0000-0000000000a1', 0, 'A step one');

-- shape
select has_column('public', 'recipe_steps', 'display_order', 'display_order column exists');
select col_type_is('public', 'recipe_steps', 'text', 'text', 'text column is text');
select col_not_null('public', 'recipe_steps', 'text', 'text is NOT NULL');

-- act as user B
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.recipe_steps
     where recipe_id = '00000000-0000-0000-0000-0000000000a1'),
  1, 'B can SELECT steps of A''s recipe (shared pool)');

select lives_ok(
  $q$ insert into recipe_steps (recipe_id, display_order, text)
      values ('00000000-0000-0000-0000-0000000000b1', 0, 'B step') $q$,
  'B can INSERT a step into its own recipe');

select throws_ok(
  $q$ insert into recipe_steps (recipe_id, display_order, text)
      values ('00000000-0000-0000-0000-0000000000a1', 1, 'intruder') $q$,
  '42501', NULL, 'B cannot INSERT a step into A''s recipe');

select throws_ok(
  $q$ update recipe_steps set text = 'hijacked'
       where recipe_id = '00000000-0000-0000-0000-0000000000a1' $q$,
  '42501', NULL, 'B cannot UPDATE a step of A''s recipe');

select throws_ok(
  $q$ update recipe_steps set recipe_id = '00000000-0000-0000-0000-0000000000a1'
       where recipe_id = '00000000-0000-0000-0000-0000000000b1' $q$,
  '42501', NULL, 'B cannot re-point its own step into A''s recipe');

select is(
  (select count(*)::int from (
     delete from recipe_steps
      where recipe_id = '00000000-0000-0000-0000-0000000000a1' returning 1) d),
  0, 'B''s DELETE against A''s steps removes nothing');

select * from finish();
rollback;
```

Note the `update … set recipe_id` assertion is a real assertion here, **not** wrapped in `todo_start` — unlike `recipe_ingredients` (gap R-22), this table's UPDATE policy gets a `with check` from day one.

- [ ] **Step 2: Run the test to verify it fails**

```bash
supabase start --workdir .
supabase test db
```

Expected: FAIL — `relation "public.recipe_steps" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260718100000_r36_recipe_steps.sql`:

```sql
-- R-36 — structured recipe steps.
--
-- Replaces the free-text recipes.instructions column (dropped in the next
-- migration, together with the save_recipe signature that wrote it).
-- Shape and RLS mirror recipe_ingredients: recipes are a SHARED POOL (R-01),
-- so SELECT is open to every authenticated user while writes are gated on the
-- parent recipe's real creator — the LIBRARY_ANON_OWNER_ID sentinel owns the
-- seeded library and must never count as a writer.
--
-- Unlike recipe_ingredients (gap R-22), the UPDATE policy carries a WITH CHECK,
-- so a row cannot be re-pointed into someone else's recipe.

create table if not exists public.recipe_steps (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes(id) on delete cascade,
  display_order integer not null default 0,
  text          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_recipe_steps_recipe
  on public.recipe_steps (recipe_id, display_order);

alter table public.recipe_steps enable row level security;

create policy "Recipe steps pool readable"
  on public.recipe_steps for select
  to authenticated
  using (true);

create policy "Real owner inserts own recipe steps"
  on public.recipe_steps for insert
  to authenticated
  with check (
    exists (
      select 1 from public.recipes r
       where r.id                 = recipe_steps.recipe_id
         and r.created_by_user_id = auth.uid()
         and r.created_by_user_id is not null
         and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
    )
  );

create policy "Real owner updates own recipe steps"
  on public.recipe_steps for update
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
       where r.id                 = recipe_steps.recipe_id
         and r.created_by_user_id = auth.uid()
         and r.created_by_user_id is not null
         and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
       where r.id                 = recipe_steps.recipe_id
         and r.created_by_user_id = auth.uid()
         and r.created_by_user_id is not null
         and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
    )
  );

create policy "Real owner deletes own recipe steps"
  on public.recipe_steps for delete
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
       where r.id                 = recipe_steps.recipe_id
         and r.created_by_user_id = auth.uid()
         and r.created_by_user_id is not null
         and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
    )
  );
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
supabase db reset --workdir .
supabase test db
```

Expected: all `08_recipe_steps` assertions PASS, and the pre-existing test files stay green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718100000_r36_recipe_steps.sql supabase/tests/08_recipe_steps.test.sql
git commit -m "feat(db): add recipe_steps table with pool-read owner-write RLS (R-36)"
```

---

### Task 2: `save_recipe` swaps `p_instructions` for `p_steps`; drop the column

**Files:**
- Create: `supabase/migrations/20260718100100_r36_save_recipe_steps.sql`
- Modify: `supabase/tests/08_recipe_steps.test.sql` (append the RPC section)

**Interfaces:**
- Consumes: `public.recipe_steps` from Task 1.
- Produces: `public.save_recipe(p_recipe_id uuid, p_name text, p_servings numeric, p_description text, p_ingredients jsonb, p_steps jsonb, p_meal_types text[] default '{}', p_prep_time_minutes integer default null) returns uuid`. `p_steps` is a JSON array of `{"text": string, "display_order": int}`. `public.recipes` no longer has an `instructions` column.

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/08_recipe_steps.test.sql`, **before** `select * from finish();` (still under the authenticated role as user B):

```sql
-- ── save_recipe replaces the whole step set, in array order ──────────────────
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'recipes'
      and column_name = 'instructions'),
  0, 'recipes.instructions column is gone');

select public.save_recipe(
  '00000000-0000-0000-0000-0000000000b1',
  'B recipe', 2, null,
  '[]'::jsonb,
  '[{"text":"paso uno","display_order":0},{"text":"paso dos","display_order":1}]'::jsonb
);

select is(
  (select array_agg(text order by display_order) from public.recipe_steps
     where recipe_id = '00000000-0000-0000-0000-0000000000b1'),
  array['paso uno', 'paso dos'],
  'save_recipe inserts steps in display_order');

select public.save_recipe(
  '00000000-0000-0000-0000-0000000000b1',
  'B recipe', 2, null,
  '[]'::jsonb,
  '[{"text":"unico","display_order":0}]'::jsonb
);

select is(
  (select count(*)::int from public.recipe_steps
     where recipe_id = '00000000-0000-0000-0000-0000000000b1'),
  1, 'save_recipe delete-and-reinserts the step set rather than appending');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
supabase test db
```

Expected: FAIL — `recipes.instructions column is gone` fails (count is 1), and the `save_recipe` calls error with "function does not exist" for the new argument list.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260718100100_r36_save_recipe_steps.sql`. Copy the body of `20260712120000_r33_recipe_prep_time.sql` and apply exactly three changes: drop the `p_instructions` parameter and its column write, add `p_steps`, and delete-and-reinsert `recipe_steps` alongside `recipe_ingredients`.

```sql
-- R-36 — save_recipe writes structured steps instead of free text.
--
-- DROP then CREATE, not CREATE OR REPLACE: the parameter list changes, so
-- `create or replace` would register an OVERLOAD and PostgREST would refuse the
-- call as ambiguous. The old signature is dropped explicitly.
--
-- recipes.instructions goes with it: R-36 starts recipe_steps empty for
-- everyone (the app has no production users yet, so there is nothing to
-- preserve) and leaves no dead column behind.

drop function if exists public.save_recipe(uuid, text, numeric, text, text, jsonb, text[], integer);

alter table public.recipes drop column if exists instructions;

create or replace function public.save_recipe(
  p_recipe_id         uuid,
  p_name              text,
  p_servings          numeric,
  p_description       text,
  p_ingredients       jsonb,
  p_steps             jsonb default '[]'::jsonb,
  p_meal_types        text[] default '{}'::text[],
  p_prep_time_minutes integer default null
)
returns uuid
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_recipe_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_recipe_id is null then
    insert into public.recipes
      (name, servings, description, meal_types, prep_time_minutes, created_by_user_id)
    values
      (p_name, p_servings, p_description, p_meal_types, p_prep_time_minutes, v_user_id)
    returning id into v_recipe_id;

    insert into public.user_recipe_refs (user_id, recipe_id)
    values (v_user_id, v_recipe_id)
    on conflict (user_id, recipe_id) do nothing;
  else
    update public.recipes
       set name              = p_name,
           servings          = p_servings,
           description       = p_description,
           meal_types        = p_meal_types,
           prep_time_minutes = p_prep_time_minutes,
           updated_at        = now()
     where id = p_recipe_id
    returning id into v_recipe_id;

    if v_recipe_id is null then
      raise exception 'recipe not found or not editable';
    end if;

    delete from public.recipe_ingredients where recipe_id = v_recipe_id;
    delete from public.recipe_steps       where recipe_id = v_recipe_id;
  end if;

  insert into public.recipe_ingredients
    (recipe_id, ingredient_id, quantity, per_serving, display_order)
  select v_recipe_id,
         (item->>'ingredient_id')::uuid,
         (item->>'quantity')::numeric,
         coalesce((item->>'per_serving')::boolean, false),
         coalesce((item->>'display_order')::int, 0)
  from jsonb_array_elements(p_ingredients) as item;

  insert into public.recipe_steps (recipe_id, display_order, text)
  select v_recipe_id,
         coalesce((item->>'display_order')::int, 0),
         item->>'text'
  from jsonb_array_elements(p_steps) as item
  where coalesce(btrim(item->>'text'), '') <> '';

  return v_recipe_id;
end;
$$;

grant execute on function
  public.save_recipe(uuid, text, numeric, text, jsonb, jsonb, text[], integer)
  to authenticated;
```

Before writing this file, open `supabase/migrations/20260712120000_r33_recipe_prep_time.sql` and confirm the surrounding statements (the `updated_at` write, the not-found guard) still match what is pasted above; if the real body differs, keep the real body and change only the three things named at the top of this step.

- [ ] **Step 4: Run the test to verify it passes**

```bash
supabase db reset --workdir .
supabase test db
```

Expected: PASS, including the pre-existing `04_rpc.test.sql`. If `04_rpc.test.sql` calls `save_recipe` with the old argument list, update those call sites in this same task — dropping `p_instructions` is exactly the kind of change that file exists to catch.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718100100_r36_save_recipe_steps.sql supabase/tests/
git commit -m "feat(db): save_recipe writes recipe_steps; drop recipes.instructions (R-36)"
```

---

### Task 3: Regenerate database types

**Files:**
- Modify: `src/types/database.ts`

**Interfaces:**
- Consumes: the migrations from Tasks 1–2.
- Produces: `Tables<'recipe_steps'>`, a `recipes` Row without `instructions`, and `save_recipe` Args with `p_steps: Json` and no `p_instructions`.

- [ ] **Step 1: Regenerate against the local stack**

The remote project does not have these migrations yet, so generate from the local stack — **not** the `--project-id` form in `docs/operations.md`:

```bash
supabase gen types typescript --local --schema public > src/types/database.ts
```

- [ ] **Step 2: Verify the three deltas landed**

```bash
grep -n "recipe_steps" src/types/database.ts | head
grep -n "p_instructions\|p_steps" src/types/database.ts
grep -c "instructions" src/types/database.ts
```

Expected: `recipe_steps` present; `p_steps` present and `p_instructions` absent; the remaining `instructions` hits are only `instructions_en` / `instructions_es` on `exercises`.

If the local stack is unavailable, hand-edit the file to make exactly those three deltas — mirroring the existing `recipe_ingredients` block at line ~863 for the new table — and note in the commit body that types were hand-edited.

- [ ] **Step 3: Typecheck to see the real blast radius**

```bash
pnpm typecheck
```

Expected: FAIL, with errors in `src/features/recipes/api.ts`, `schema.ts`, `RecipeEditorForm.tsx`, `RecetaEditorPage.tsx`, `RecetaDetailPage.tsx`, `RecipePeek.tsx`. That list is the checklist for Tasks 4–9; do not fix them here.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "chore(types): regenerate database types for recipe_steps (R-36)"
```

---

### Task 4: API layer — fetch steps, save steps, read/write the note

**Files:**
- Modify: `src/features/recipes/api.ts:131-190`
- Create: `src/features/recipes/notes.ts`
- Create: `src/features/recipes/notes.test.ts`

**Interfaces:**
- Consumes: types from Task 3.
- Produces:
  - `RecipeStep = Tables<'recipe_steps'>`
  - `RecipeWithIngredients` additionally carries `recipe_steps: RecipeStep[]`, sorted by `display_order`
  - `SaveRecipePayload` drops `instructions` and gains `steps: Array<{ text: string; display_order: number }>`
  - `fetchRecipeNote(recipeId: string): Promise<{ exists: boolean; note: string }>`
  - `saveRecipeNote(recipeId: string, note: string): Promise<void>`
  - `normalizeNote(raw: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/features/recipes/notes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeNote } from './notes';

describe('normalizeNote', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeNote('  sale mejor con menos sal  ')).toBe('sale mejor con menos sal');
  });

  it('maps an empty or whitespace-only note to null so the column clears', () => {
    expect(normalizeNote('')).toBeNull();
    expect(normalizeNote('   \n  ')).toBeNull();
  });

  it('preserves interior line breaks', () => {
    expect(normalizeNote('linea uno\nlinea dos')).toBe('linea uno\nlinea dos');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/features/recipes/notes.test.ts
```

Expected: FAIL — cannot resolve `./notes`.

- [ ] **Step 3: Write `src/features/recipes/notes.ts`**

```ts
import { supabase } from '@/integrations/supabase/client';

/**
 * Private per-user recipe notes.
 *
 * These live on user_recipe_refs.note, never on the shared `recipes` row —
 * recipes are a pool (R-01) and the note is PII. That table is a single table
 * with `auth.uid() = user_id` RLS, so a plain update is correct here: the
 * RPC-only rule covers atomic multi-table mutations.
 */

/** Empty/whitespace clears the column; anything else is stored trimmed. */
export function normalizeNote(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

export interface RecipeNoteState {
  /** False when the recipe is not in the user's library — no ref row exists. */
  exists: boolean;
  note: string;
}

export async function fetchRecipeNote(recipeId: string): Promise<RecipeNoteState> {
  const { data, error } = await supabase
    .from('user_recipe_refs')
    .select('note')
    .eq('recipe_id', recipeId)
    .maybeSingle();
  if (error) throw error;
  return { exists: !!data, note: data?.note ?? '' };
}

export async function saveRecipeNote(recipeId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('user_recipe_refs')
    .update({ note: normalizeNote(note), updated_at: new Date().toISOString() })
    .eq('recipe_id', recipeId);
  if (error) throw error;
}
```

The `select`/`update` carry no `user_id` filter on purpose — RLS scopes both to the caller, and `maybeSingle()` yields `null` when the user holds no ref.

Confirm the client import path matches the rest of the feature: `grep -n "supabase/client" src/features/recipes/api.ts` and copy that specifier exactly.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run src/features/recipes/notes.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Update `fetchRecipe` and `saveRecipe` in `api.ts`**

In `src/features/recipes/api.ts`, add the type next to the existing ones (~line 12-17):

```ts
export type RecipeStep = Tables<'recipe_steps'>;

export interface RecipeWithIngredients extends Recipe {
  recipe_ingredients: Array<RecipeIngredient & { ingredient: Ingredient }>;
  recipe_steps: RecipeStep[];
}
```

Extend the `fetchRecipe` select (~line 134) and sort the steps:

```ts
    .select(
      `*,
       recipe_ingredients (
         id, recipe_id, ingredient_id, quantity, per_serving, display_order, created_at,
         ingredient:ingredients (*)
       ),
       recipe_steps (
         id, recipe_id, display_order, text, created_at
       )`,
    )
```

```ts
  const raw = data as unknown as Recipe & {
    recipe_ingredients: RawJoin[];
    recipe_steps: RecipeStep[];
  };
  ...
  const steps = (raw.recipe_steps ?? []).slice().sort((a, b) => a.display_order - b.display_order);
  return { ...raw, recipe_ingredients: rows, recipe_steps: steps };
```

In the payload interface (~line 162) replace `instructions: string | null;` with:

```ts
  steps: Array<{ text: string; display_order: number }>;
```

and in the `rpc` call (~line 184) replace `p_instructions: payload.instructions,` with `p_steps: payload.steps,`.

Also extend `listRecipes` (~line 52-73) with the same `recipe_steps ( … )` block **only if** a list consumer needs steps. It does not today — leave it alone, and say so in the commit if asked.

- [ ] **Step 6: Verify the select string against a real database**

Mocked tests cannot catch a malformed PostgREST select string. With the local stack up:

```bash
pnpm vitest run src/features/recipes
```

then, in Task 12's browser pass, open a recipe detail page and confirm the network response contains a `recipe_steps` array. Do not mark this task done on typecheck alone.

- [ ] **Step 7: Commit**

```bash
git add src/features/recipes/api.ts src/features/recipes/notes.ts src/features/recipes/notes.test.ts
git commit -m "feat(recipes): fetch and save recipe steps; add private note API (R-36)"
```

---

### Task 5: Form schema — `instructions` becomes `steps`

**Files:**
- Modify: `src/features/recipes/schema.ts:29-46,88-155`
- Modify: `src/features/recipes/schema.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RecipeFormValues` with `steps: Array<{ stepId: string; text: string }>` and no `instructions`; new error code `stepEmpty` appended to `RECIPE_ERROR_ORDER`.

- [ ] **Step 1: Write the failing test**

In `src/features/recipes/schema.test.ts`, remove `instructions: ''` from the `form()` builder, add `steps: []`, and append:

```ts
describe('steps', () => {
  it('accepts an empty step list — a recipe may have no method', () => {
    expect(recipeFormSchema.safeParse(form({ steps: [] })).success).toBe(true);
  });

  it('accepts steps with text', () => {
    const res = recipeFormSchema.safeParse(
      form({ steps: [{ stepId: 's1', text: 'Sofreir la cebolla' }] }),
    );
    expect(res.success).toBe(true);
  });

  it('rejects a step whose text is empty or whitespace-only', () => {
    for (const text of ['', '   ']) {
      const res = recipeFormSchema.safeParse(form({ steps: [{ stepId: 's1', text }] }));
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.find((i) => i.path[0] === 'steps')?.message).toBe('stepEmpty');
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/features/recipes/schema.test.ts
```

Expected: FAIL — the `steps` key is stripped by the schema, so no `stepEmpty` issue is raised.

- [ ] **Step 3: Update the schema**

In `src/features/recipes/schema.ts`, add next to `rowSchema` (line ~29):

```ts
const stepSchema = z.object({
  stepId: z.string(),
  text: z.string(),
});
```

Append `'stepEmpty'` to `RECIPE_ERROR_ORDER` (after `'rowInvalidQuantity'`). In `recipeFormSchema` (line ~88) delete `instructions: z.string(),` and add:

```ts
    // R-36: structured steps replace the old free-text `instructions` column.
    // An empty list is valid — not every recipe needs a method.
    steps: z.array(stepSchema).default([]),
```

At the end of the `superRefine` body, after the ingredient row loop:

```ts
    for (const step of v.steps) {
      if (step.text.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps'], message: 'stepEmpty' });
        return;
      }
    }
```

Add `'steps'` to the field list in `firstRecipeError` (line ~163), after `'rows'`:

```ts
  return pickFirstError(errors, ['name', 'servings', 'prepTime', 'rows', 'steps'], RECIPE_ERROR_ORDER);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run src/features/recipes/schema.test.ts
```

Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Add the error copy**

In `src/i18n/es/recetas.json` under `errors`: `"stepEmpty": "Hay un paso vacío. Escríbelo o bórralo."`
In `src/i18n/en/recetas.json` under `errors`: `"stepEmpty": "A step is empty. Write it or remove it."`

- [ ] **Step 6: Commit**

```bash
git add src/features/recipes/schema.ts src/features/recipes/schema.test.ts src/i18n/es/recetas.json src/i18n/en/recetas.json
git commit -m "feat(recipes): validate structured steps in the recipe form schema (R-36)"
```

---

### Task 6: `RecipeStepsField` — the editor's step list

**Files:**
- Create: `src/features/recipes/components/RecipeStepsField.tsx`
- Create: `src/features/recipes/components/RecipeStepsField.test.tsx`

**Interfaces:**
- Consumes: `RecipeFormValues['steps']` from Task 5.
- Produces: `<RecipeStepsField />` — a self-contained field array bound to the ambient `useFormContext<EditorState>()`; no props.

- [ ] **Step 1: Write the failing test**

Create `src/features/recipes/components/RecipeStepsField.test.tsx`. Wrap the component in a form provider, since it reads the ambient control:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { RecipeStepsField } from './RecipeStepsField';

function Harness({ steps }: { steps: Array<{ stepId: string; text: string }> }) {
  const methods = useForm({ defaultValues: { steps } });
  return (
    <FormProvider {...methods}>
      <RecipeStepsField />
    </FormProvider>
  );
}

const twoSteps = [
  { stepId: 's1', text: 'primero' },
  { stepId: 's2', text: 'segundo' },
];

describe('RecipeStepsField', () => {
  it('renders one textarea per step, numbered in order', () => {
    render(<Harness steps={twoSteps} />);
    const areas = screen.getAllByRole('textbox');
    expect(areas).toHaveLength(2);
    expect((areas[0] as HTMLTextAreaElement).value).toBe('primero');
    expect((areas[1] as HTMLTextAreaElement).value).toBe('segundo');
  });

  it('adds an empty step', async () => {
    render(<Harness steps={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /paso/i }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('moves a step down, swapping it with its neighbour', async () => {
    render(<Harness steps={twoSteps} />);
    await userEvent.click(screen.getAllByRole('button', { name: /bajar|move down/i })[0]);
    const areas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    expect(areas[0].value).toBe('segundo');
    expect(areas[1].value).toBe('primero');
  });

  it('disables up on the first step and down on the last', () => {
    render(<Harness steps={twoSteps} />);
    const ups = screen.getAllByRole('button', { name: /subir|move up/i });
    const downs = screen.getAllByRole('button', { name: /bajar|move down/i });
    expect(ups[0]).toBeDisabled();
    expect(downs[downs.length - 1]).toBeDisabled();
  });

  it('removes a step', async () => {
    render(<Harness steps={twoSteps} />);
    await userEvent.click(screen.getAllByRole('button', { name: /eliminar|remove/i })[0]);
    const areas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    expect(areas).toHaveLength(1);
    expect(areas[0].value).toBe('segundo');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/features/recipes/components/RecipeStepsField.test.tsx
```

Expected: FAIL — cannot resolve `./RecipeStepsField`.

- [ ] **Step 3: Write the component**

Create `src/features/recipes/components/RecipeStepsField.tsx`:

```tsx
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { EditorState } from './RecipeEditorForm';

/**
 * R-36 — structured, reorderable steps.
 *
 * Reordering is ↑/↓ buttons over the field array's `swap()`, not drag and drop:
 * no DnD library exists in the repo, and dragging fights form scroll on mobile,
 * which is the surface that wins when the artboards disagree. The first ↑ and
 * last ↓ are disabled rather than hidden so rows do not shift while reordering.
 */
export function RecipeStepsField() {
  const { t } = useTranslation('recetas');
  const { control, register } = useFormContext<EditorState>();
  const { fields, append, remove, swap } = useFieldArray<EditorState>({
    control,
    name: 'steps',
  });

  return (
    <div className="space-y-2.5">
      {fields.map((field, i) => (
        <div key={field.id} className="flex items-start gap-2.5">
          <span className="tnum mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13.5px] font-semibold text-accent-ink">
            {i + 1}
          </span>
          <Textarea
            rows={2}
            aria-label={t('form.stepNumber', { number: i + 1 })}
            placeholder={t('form.stepPlaceholder')}
            className="min-h-[56px] resize-y rounded-[10px] bg-muted text-[13px] leading-[1.6]"
            {...register(`steps.${i}.text` as const)}
          />
          <div className="flex shrink-0 flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={i === 0}
              aria-label={t('form.moveStepUp')}
              onClick={() => swap(i, i - 1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={i === fields.length - 1}
              aria-label={t('form.moveStepDown')}
              onClick={() => swap(i, i + 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-text-dim"
              aria-label={t('form.removeStep')}
              onClick={() => remove(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => append({ stepId: crypto.randomUUID(), text: '' })}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t('form.addStep')}
      </Button>
    </div>
  );
}
```

Before writing, check how `RecipeEditorForm.tsx` generates row ids (`newRowId()` around line 67) and reuse that helper for `stepId` instead of calling `crypto.randomUUID()` directly, so both field arrays mint ids the same way.

- [ ] **Step 4: Add the i18n keys**

`src/i18n/es/recetas.json` under `form`:

```json
"steps": "Pasos",
"stepNumber": "Paso {{number}}",
"stepPlaceholder": "Describe este paso…",
"addStep": "Añadir paso",
"moveStepUp": "Subir el paso",
"moveStepDown": "Bajar el paso",
"removeStep": "Eliminar el paso",
"stepsEmptyHint": "Aún no hay pasos. Añade el primero."
```

`src/i18n/en/recetas.json` under `form`:

```json
"steps": "Steps",
"stepNumber": "Step {{number}}",
"stepPlaceholder": "Describe this step…",
"addStep": "Add step",
"moveStepUp": "Move step up",
"moveStepDown": "Move step down",
"removeStep": "Remove step",
"stepsEmptyHint": "No steps yet. Add the first one."
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm vitest run src/features/recipes/components/RecipeStepsField.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/recipes/components/RecipeStepsField.tsx src/features/recipes/components/RecipeStepsField.test.tsx src/i18n/es/recetas.json src/i18n/en/recetas.json
git commit -m "feat(recipes): add reorderable steps field to the editor (R-36)"
```

---

### Task 7: Wire the steps field into the editor form and page

**Files:**
- Modify: `src/features/recipes/components/RecipeEditorForm.tsx:46-85,578-599`
- Modify: `src/pages/RecetaEditorPage.tsx:87-125`
- Modify: `src/features/recipes/components/RecipeEditorForm.test.tsx`, `.test.ts`
- Modify: `src/pages/RecetaEditorPage.test.tsx`

**Interfaces:**
- Consumes: `<RecipeStepsField />` (Task 6), `steps` in `RecipeFormValues` (Task 5), `SaveRecipePayload.steps` (Task 4).
- Produces: `EditorState` with `steps`; `save_recipe` receives `steps` ordered by array index.

- [ ] **Step 1: Write the failing test**

In `src/pages/RecetaEditorPage.test.tsx`, add a case asserting the submitted payload (follow the file's existing mock of the save mutation):

```tsx
it('sends steps with display_order matching the visible order', async () => {
  // …render the editor with two steps, "primero" then "segundo"…
  await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

  expect(saveMock).toHaveBeenCalledWith(
    expect.objectContaining({
      steps: [
        { text: 'primero', display_order: 0 },
        { text: 'segundo', display_order: 1 },
      ],
    }),
  );
});
```

Read the file first and reuse its existing render helper and mock names rather than inventing new ones; `saveMock` above is a placeholder for whatever that file already calls it.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/pages/RecetaEditorPage.test.tsx
```

Expected: FAIL — the payload still carries `instructions`.

- [ ] **Step 3: Update `RecipeEditorForm.tsx`**

`EditorState` (line ~49) needs no change beyond what the schema gives it, since it is derived from `RecipeFormValues`. In `emptyEditorState()` (line ~51) replace `instructions: ''` with `steps: []`. In `recipeToEditorState()` (line ~67) add:

```ts
    steps: (recipe.recipe_steps ?? []).map((s) => ({
      stepId: newRowId(),
      text: s.text,
    })),
```

Replace the instructions Card (lines 578-599) with the steps Card, keeping the same chrome:

```tsx
        {/* R-36: structured steps replace the single `instructions` textarea. */}
        <Card className="overflow-hidden">
          <div className="border-b bg-muted px-4 py-2.5">
            <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
              {t('form.steps')}
            </h2>
          </div>
          <div className="p-3.5">
            <RecipeStepsField />
          </div>
        </Card>
```

Add the import and drop the now-unused `Textarea` import if nothing else in the file uses it (`grep -n "Textarea" src/features/recipes/components/RecipeEditorForm.tsx` — the description field may still need it).

`RecipeStepsField` reads `useFormContext`, so the form must be wrapped in a `<FormProvider>`. Check whether `RecipeEditorForm` already provides one; if it does not, wrap its `<form>` with `<FormProvider {...methods}>` using the existing `useForm` result.

- [ ] **Step 4: Update `RecetaEditorPage.tsx`**

In the `save.mutateAsync` call (lines ~87-125) delete the `instructions:` line and add, after `ingredients`:

```ts
        steps: state.steps
          .map((s) => s.text.trim())
          .filter((text) => text !== '')
          .map((text, i) => ({ text, display_order: i })),
```

`display_order` is the index **after** filtering out blanks, so the saved sequence has no gaps.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm vitest run src/pages/RecetaEditorPage.test.tsx src/features/recipes
pnpm typecheck
```

Expected: PASS, and typecheck clean for the editor files.

- [ ] **Step 6: Commit**

```bash
git add src/features/recipes/components/RecipeEditorForm.tsx src/features/recipes/components/RecipeEditorForm.test.tsx src/features/recipes/components/RecipeEditorForm.test.ts src/pages/RecetaEditorPage.tsx src/pages/RecetaEditorPage.test.tsx
git commit -m "feat(recipes): edit structured steps in the recipe editor (R-36)"
```

---

### Task 8: Detail page — the "Preparación" step list

**Files:**
- Modify: `src/pages/RecetaDetailPage.tsx:337-359`
- Modify: `src/pages/RecetaDetailPage.test.tsx`

**Interfaces:**
- Consumes: `RecipeWithIngredients.recipe_steps` (Task 4), `canEditRecipe` (`src/features/recipes/ownership.ts`).
- Produces: nothing consumed later.

- [ ] **Step 1: Write the failing test**

Append to `src/pages/RecetaDetailPage.test.tsx`, reusing the file's existing recipe fixture and render helper:

```tsx
it('renders steps as an ordered, numbered list', async () => {
  renderDetail({
    ...recipeFixture,
    recipe_steps: [
      { id: 's1', recipe_id: 'r1', display_order: 0, text: 'primero', created_at: '' },
      { id: 's2', recipe_id: 'r1', display_order: 1, text: 'segundo', created_at: '' },
    ],
  });
  const items = await screen.findAllByRole('listitem');
  expect(items.some((li) => li.textContent?.includes('primero'))).toBe(true);
});

it('hides the steps card entirely for a non-owner when there are no steps', () => {
  renderDetail({ ...recipeFixture, created_by_user_id: 'someone-else', recipe_steps: [] });
  expect(screen.queryByText(/preparación/i)).not.toBeInTheDocument();
});

it('shows an empty state to the owner when there are no steps', () => {
  renderDetail({ ...recipeFixture, created_by_user_id: CURRENT_USER_ID, recipe_steps: [] });
  expect(screen.getByText(/aún no hay pasos/i)).toBeInTheDocument();
});
```

`renderDetail`, `recipeFixture` and `CURRENT_USER_ID` are placeholders for the helpers that file already defines — read it first and use the real names.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/pages/RecetaDetailPage.test.tsx
```

Expected: FAIL — the page still reads `recipe.instructions`.

- [ ] **Step 3: Replace the instructions Card**

Replace lines 337-359 with:

```tsx
          {/* R-36: real structured steps. Per-step photos are R-36b. */}
          {(recipe.recipe_steps.length > 0 || canEdit) && (
            <Card data-slot="steps" className="px-4 pb-3 pt-0 md:px-4.5">
              <div className="border-b py-3">
                <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
                  {t('detail.instructionsTitle')}
                </h2>
              </div>
              {recipe.recipe_steps.length > 0 ? (
                <ol>
                  {recipe.recipe_steps.map((step, i) => (
                    <li key={step.id} className="flex items-start gap-3.5 border-t py-3 first:border-t-0">
                      <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13.5px] font-semibold text-accent-ink">
                        {i + 1}
                      </span>
                      <p className="whitespace-pre-line pt-0.5 text-[13.5px] leading-[1.6]">
                        {step.text}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="py-6">
                  <EmptyState
                    icon={ListOrdered}
                    title={t('detail.noStepsTitle')}
                    hint={t('detail.noStepsHint')}
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/recipes/${recipe.id}/edit`}>{t('detail.edit')}</Link>
                      </Button>
                    }
                  />
                </div>
              )}
            </Card>
          )}
```

Add `ListOrdered` to the `lucide-react` import. `EmptyState`, `Button`, `Link` and `canEdit` (line 178) already exist in the file. Verify the edit route matches the one the page's existing edit button uses.

The number is a positional label, not a measurement, so `{i + 1}` needs no locale helper — the same call the old Card made with its hardcoded `1`.

- [ ] **Step 4: Add the i18n keys**

`src/i18n/es/recetas.json` under `detail`: `"noStepsTitle": "Aún no hay pasos"`, `"noStepsHint": "Añade la preparación paso a paso."`
`src/i18n/en/recetas.json` under `detail`: `"noStepsTitle": "No steps yet"`, `"noStepsHint": "Add the method step by step."`

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm vitest run src/pages/RecetaDetailPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/RecetaDetailPage.tsx src/pages/RecetaDetailPage.test.tsx src/i18n/es/recetas.json src/i18n/en/recetas.json
git commit -m "feat(recipes): render structured steps on the recipe detail page (R-36)"
```

---

### Task 9: `RecipePeek` reads steps

**Files:**
- Modify: `src/features/planning/components/RecipePeek.tsx:169-176`
- Modify: `src/features/planning/components/RecipePeek.test.tsx`

**Interfaces:**
- Consumes: `RecipeWithIngredients.recipe_steps` (Task 4).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

In `src/features/planning/components/RecipePeek.test.tsx`, adapt the existing instructions case (there is one — `grep -n "instructions" src/features/planning/components/RecipePeek.test.tsx`) to steps:

```tsx
it('lists the recipe steps', () => {
  renderPeek({
    ...recipeFixture,
    recipe_steps: [
      { id: 's1', recipe_id: 'r1', display_order: 0, text: 'sofreir', created_at: '' },
    ],
  });
  expect(screen.getByText('sofreir')).toBeInTheDocument();
});
```

Use the file's real fixture/render helper names.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/features/planning/components/RecipePeek.test.tsx
```

Expected: FAIL — the component still reads `recipe.instructions`.

- [ ] **Step 3: Update the component**

Replace lines 169-176 with an ordered list over `recipe.recipe_steps`, keeping the existing heading and wrapper classes:

```tsx
                {recipe.recipe_steps.length > 0 && (
                  <>
                    <h3 className="…keep the existing heading classes…">
                      {t('peek.instructions')}
                    </h3>
                    <ol className="list-decimal space-y-1 pl-4">
                      {recipe.recipe_steps.map((step) => (
                        <li key={step.id}>{step.text}</li>
                      ))}
                    </ol>
                  </>
                )}
```

Read lines 160-180 first and preserve the real class names and element structure — only the data source and the list markup change.

If `RecipePeek` is fed by `listRecipes` rather than `fetchRecipe`, its recipes will have no `recipe_steps` field. Check which query supplies it; if it is the list query, add the `recipe_steps ( id, recipe_id, display_order, text, created_at )` block to the nested select in `src/features/recipes/api.ts:52-73` and mention that in the commit.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run src/features/planning/components/RecipePeek.test.tsx
pnpm typecheck
```

Expected: PASS and a clean typecheck — this was the last `instructions` consumer.

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/RecipePeek.tsx src/features/planning/components/RecipePeek.test.tsx src/features/recipes/api.ts
git commit -m "feat(planner): show recipe steps in the recipe peek (R-36)"
```

---

### Task 10: `RecipeNotesCard` — private notes, inline

**Files:**
- Create: `src/features/recipes/components/RecipeNotesCard.tsx`
- Create: `src/features/recipes/components/RecipeNotesCard.test.tsx`
- Modify: `src/features/recipes/hooks.ts`

**Interfaces:**
- Consumes: `fetchRecipeNote`, `saveRecipeNote` (Task 4).
- Produces: `useRecipeNote(recipeId)` query hook, `useSaveRecipeNote()` mutation hook, `<RecipeNotesCard recipeId={string} />`.

- [ ] **Step 1: Write the failing test**

Create `src/features/recipes/components/RecipeNotesCard.test.tsx`. Mock the hooks module — a component test that imports supabase-backed code fails in CI without env vars unless the data hook is mocked:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecipeNotesCard } from './RecipeNotesCard';

const saveNote = vi.fn();
let noteState = { exists: true, note: 'menos sal' };

vi.mock('../hooks', () => ({
  useRecipeNote: () => ({ data: noteState, isLoading: false }),
  useSaveRecipeNote: () => ({ mutate: saveNote, isPending: false }),
}));

describe('RecipeNotesCard', () => {
  it('shows the stored note', () => {
    noteState = { exists: true, note: 'menos sal' };
    render(<RecipeNotesCard recipeId="r1" />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('menos sal');
  });

  it('renders nothing when the recipe is not in the user library', () => {
    noteState = { exists: false, note: '' };
    const { container } = render(<RecipeNotesCard recipeId="r1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('saves on blur when the text changed', async () => {
    noteState = { exists: true, note: 'menos sal' };
    saveNote.mockClear();
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    await userEvent.tab();
    expect(saveNote).toHaveBeenCalledWith({ recipeId: 'r1', note: 'mas pimienta' });
  });

  it('does not save on blur when the text is unchanged', async () => {
    noteState = { exists: true, note: 'menos sal' };
    saveNote.mockClear();
    render(<RecipeNotesCard recipeId="r1" />);
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.tab();
    expect(saveNote).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/features/recipes/components/RecipeNotesCard.test.tsx
```

Expected: FAIL — cannot resolve `./RecipeNotesCard`.

- [ ] **Step 3: Add the hooks**

In `src/features/recipes/hooks.ts`, following the shape of `useRecipe` (line 21):

```ts
import { fetchRecipeNote, saveRecipeNote } from './notes';

export function useRecipeNote(recipeId: string | null | undefined) {
  return useQuery({
    enabled: !!recipeId,
    queryKey: ['recipes', 'note', recipeId],
    queryFn: () => fetchRecipeNote(recipeId!),
  });
}

export function useSaveRecipeNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, note }: { recipeId: string; note: string }) =>
      saveRecipeNote(recipeId, note),
    onSuccess: (_data, { recipeId }) => {
      qc.invalidateQueries({ queryKey: ['recipes', 'note', recipeId] });
    },
  });
}
```

Match the file's existing import list and mutation style (`grep -n "useMutation\|useQueryClient" src/features/recipes/hooks.ts`).

- [ ] **Step 4: Write the component**

Create `src/features/recipes/components/RecipeNotesCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useRecipeNote, useSaveRecipeNote } from '../hooks';

/**
 * R-36 — a private, per-user note on a recipe.
 *
 * The note lives on user_recipe_refs.note, so it exists only for recipes in the
 * user's library — including recipes created by someone else, which the user
 * cannot edit but can still annotate. Saves on blur: the note is read often
 * (while cooking) and written briefly, so a dialog would tax the common case.
 */
export function RecipeNotesCard({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation('recetas');
  const { data, isLoading } = useRecipeNote(recipeId);
  const save = useSaveRecipeNote();
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setDraft(data.note);
  }, [data]);

  if (isLoading || !data?.exists) return null;

  function handleBlur() {
    if (draft.trim() === (data?.note ?? '').trim()) return;
    save.mutate({ recipeId, note: draft });
    setSaved(true);
  }

  return (
    <Card data-slot="notes" className="px-4 pb-3 pt-0 md:px-4.5">
      <div className="flex items-center justify-between border-b py-3">
        <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
          {t('detail.notesTitle')}
        </h2>
        {saved && !save.isPending && (
          <span className="text-[10.5px] text-text-dim">{t('detail.notesSaved')}</span>
        )}
      </div>
      <div className="py-3">
        <Textarea
          rows={3}
          aria-label={t('detail.notesTitle')}
          placeholder={t('detail.notesPlaceholder')}
          className="min-h-[72px] resize-y rounded-[10px] bg-muted text-[13px] leading-[1.6]"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          onBlur={handleBlur}
        />
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Add the i18n keys**

`src/i18n/es/recetas.json` under `detail`: `"notesTitle": "Mis notas"`, `"notesPlaceholder": "Anota tus ajustes: menos sal, 5 min más…"`, `"notesSaved": "Guardado"`
`src/i18n/en/recetas.json` under `detail`: `"notesTitle": "My notes"`, `"notesPlaceholder": "Jot down your tweaks: less salt, 5 more minutes…"`, `"notesSaved": "Saved"`

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm vitest run src/features/recipes/components/RecipeNotesCard.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/features/recipes/components/RecipeNotesCard.tsx src/features/recipes/components/RecipeNotesCard.test.tsx src/features/recipes/hooks.ts src/i18n/es/recetas.json src/i18n/en/recetas.json
git commit -m "feat(recipes): add private per-user recipe notes card (R-36)"
```

---

### Task 11: Mount the notes card + pgTAP note isolation

**Files:**
- Modify: `src/pages/RecetaDetailPage.tsx`
- Modify: `src/pages/RecetaDetailPage.test.tsx`
- Modify: `supabase/tests/08_recipe_steps.test.sql`

**Interfaces:**
- Consumes: `<RecipeNotesCard />` (Task 10).
- Produces: nothing.

- [ ] **Step 1: Write the failing pgTAP assertion**

Append to `supabase/tests/08_recipe_steps.test.sql` before `finish()`. Seed A's ref with a note in the privileged section at the top of the file:

```sql
insert into public.user_recipe_refs (user_id, recipe_id, note) values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-0000000000a1', 'nota privada de A')
on conflict (user_id, recipe_id) do nothing;
```

and assert, under user B:

```sql
select is(
  (select count(*)::int from public.user_recipe_refs
     where recipe_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'B cannot see A''s recipe ref, so cannot read A''s private note');
```

- [ ] **Step 2: Run it to verify the whole file still passes**

```bash
supabase test db
```

Expected: PASS — this asserts the existing `user_recipe_refs` RLS rather than new behaviour, and locks in the PII firewall so a future select cannot quietly widen it.

- [ ] **Step 3: Write the failing component test**

In `src/pages/RecetaDetailPage.test.tsx`, mock the notes card (the page test should not reach the network):

```tsx
vi.mock('@/features/recipes/components/RecipeNotesCard', () => ({
  RecipeNotesCard: ({ recipeId }: { recipeId: string }) => (
    <div data-testid="notes-card">{recipeId}</div>
  ),
}));
```

```tsx
it('mounts the private notes card for the recipe', async () => {
  renderDetail(recipeFixture);
  expect(await screen.findByTestId('notes-card')).toHaveTextContent(recipeFixture.id);
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
pnpm vitest run src/pages/RecetaDetailPage.test.tsx
```

Expected: FAIL — no `notes-card` in the tree.

- [ ] **Step 5: Mount it**

In `src/pages/RecetaDetailPage.tsx`, add the import and render `<RecipeNotesCard recipeId={recipe.id} />` immediately after the steps Card, inside the same grid column.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm vitest run src/pages/RecetaDetailPage.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/RecetaDetailPage.tsx src/pages/RecetaDetailPage.test.tsx supabase/tests/08_recipe_steps.test.sql
git commit -m "feat(recipes): mount the private notes card on recipe detail (R-36)"
```

---

### Task 12: Full verification, browser pass, docs

**Files:**
- Modify: `docs/data-model.md`, `docs/roadmap.md`, `docs/changelog.md`

**Interfaces:**
- Consumes: everything.
- Produces: a merge-ready branch.

- [ ] **Step 1: Run the full suite yourself**

Do not trust per-task green reports; run the whole thing:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
supabase test db
git status --short
```

Expected: all green, working tree clean apart from intended changes. The full Vitest run takes roughly 11–15 minutes.

- [ ] **Step 2: Real-browser pass**

jsdom cannot see CSS, so layout bugs ship green. With `pnpm dev` running, in **Spanish**, at desktop and mobile widths:

1. Create a recipe with three steps; reorder the middle one up and down; delete one; save.
2. Reopen it: steps must read in the saved order, numbered 1·2·3.
3. Confirm the network response for the detail query contains a `recipe_steps` array (this is the check mocked tests cannot do — a malformed PostgREST select string only fails here).
4. Write a note, click elsewhere, reload: the note persists and "Guardado" appeared.
5. Open a recipe created by someone else (or by the seeded library owner): steps are read-only, no edit affordance, and the notes card is still editable.
6. Open a recipe with no steps as its owner: the empty state with the edit link shows. As a non-owner: no Preparación card at all.
7. Check the planner's recipe peek renders the steps.

- [ ] **Step 3: Update the docs**

- `docs/data-model.md`: add `recipe_steps` beside `recipe_ingredients` with its RLS, note the `with check` that `recipe_ingredients` lacks (R-22), record the new `save_recipe` signature, remove `recipes.instructions`, and mark `user_recipe_refs.note` as live rather than unused.
- `docs/roadmap.md`: under R-36, move structured steps and private notes from "scope (open)" to "shipped"; leave per-step photos, the "Fotos de los pasos" setting, and the storage decision as **R-36b**, and add the R-36b entry to the family index at the end of the file.
- `docs/changelog.md`: one entry for R-36.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: record R-36 structured steps and private notes"
```

- [ ] **Step 5: Open the PR — only once everything above is done**

Auto-merge ships a `claude/*` PR the moment CI is green, so do not open it while still fixing anything.

```bash
git push -u origin claude/r36-recipe-steps-notes
gh pr create --base develop --title "feat(recipes): structured steps + private notes (R-36)" --body "…"
```

The PR body describes the change and links the spec. No AI attribution anywhere.

---

## Deployment note

These migrations are **not** on the live project. Before the eventual `release/*` promotion, the `recipe_steps` table and the new `save_recipe` signature must exist in production, or the frontend will outrun the schema — the failure mode recorded in the live-DB migration gap. Dropping `recipes.instructions` in production is safe only after the frontend that reads it is gone, which the same release carries.
