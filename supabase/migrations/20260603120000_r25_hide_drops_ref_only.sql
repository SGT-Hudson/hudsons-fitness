-- R-25: hiding a pooled item just drops the caller's reference row.
--
-- Previously hide_owned_recipe / hide_owned_ingredient also transferred pool
-- ownership to the anon sentinel. That transfer existed to feed the R-01
-- Phase-2 auto-reaper (now cancelled) and broke under RLS anyway: the function
-- is SECURITY INVOKER, but the pool UPDATE policy's WITH CHECK requires
-- created_by_user_id = auth.uid() (and <> anon), so setting created_by = anon
-- was rejected with SQLSTATE 42501 — hiding was broken (never surfaced: no
-- production users). Tier-3 (R-16) caught it.
--
-- New model: hide = remove from my library = drop my reference row. The
-- creator keeps ownership and edit rights; re-adding the item later still lets
-- them edit it. The anon sentinel is now reached only via account deletion
-- (reconcile_account_delete, SECURITY DEFINER), which legitimately reassigns a
-- departing user's still-owned items so FKs are not stranded.
--
-- Idempotent: plain CREATE OR REPLACE; no schema change. Drops the pool UPDATE
-- from each function body; the single-table delete stays INVOKER (no >1-table
-- mutation remains, but the RPC is kept for a stable client API surface).

create or replace function public.hide_owned_recipe(p_recipe_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
begin
  delete from public.user_recipe_refs
   where user_id   = auth.uid()
     and recipe_id = p_recipe_id;
end
$function$;

create or replace function public.hide_owned_ingredient(p_ingredient_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
begin
  delete from public.user_ingredient_refs
   where user_id       = auth.uid()
     and ingredient_id = p_ingredient_id;
end
$function$;
