-- R-36 — structured recipe steps.
--
-- Replaces the free-text recipes.instructions column (dropped in the next
-- migration, together with the save_recipe signature that wrote it).
-- Shape and RLS mirror recipe_ingredients: recipes are a SHARED POOL (R-01),
-- so SELECT is open to every authenticated user while writes are gated on the
-- parent recipe's real creator — the LIBRARY_ANON_OWNER_ID sentinel owns the
-- seeded library and must never count as a writer.
--
-- The UPDATE policy's WITH CHECK is identical to USING, written explicitly
-- for intent and to guard against future USING narrowing, which would otherwise
-- silently stop covering the new row.

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
