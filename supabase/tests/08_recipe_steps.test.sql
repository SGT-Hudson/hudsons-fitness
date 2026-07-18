-- Tier-3 / R-36 — RLS isolation on recipe_steps (ownership via a join to the
-- parent recipe). Recipes are a shared pool (R-01): SELECT is open to every
-- authenticated user, writes are gated on the parent's real creator. The UPDATE
-- policy's WITH CHECK is identical to USING, written explicitly for intent and
-- to guard against future USING narrowing.

begin;
select * from no_plan();

-- privileged seeds (before assuming the authenticated role)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com')
on conflict (id) do nothing;

insert into public.recipes (id, name, servings, created_by_user_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'A recipe', 2, '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-0000000000b1', 'B recipe', 2, '22222222-2222-2222-2222-222222222222'),
  -- sentinel-owned (LIBRARY_ANON_OWNER_ID, R-01): a hidden/anonymised pool
  -- recipe. Nobody — not even an authenticated user with no other stake in
  -- it — may write its steps; a policy that dropped the sentinel clause
  -- would let this recipe's steps be silently hijacked.
  ('00000000-0000-0000-0000-0000000000c1', 'Anon recipe', 2, '00000000-0000-0000-0000-00000000a0a0')
on conflict (id) do nothing;

insert into public.recipe_steps (recipe_id, display_order, text) values
  ('00000000-0000-0000-0000-0000000000a1', 0, 'A step one'),
  ('00000000-0000-0000-0000-0000000000c1', 0, 'Anon step');

-- R-36: A's private note on A's own recipe ref (PII firewall regression seed).
insert into public.user_recipe_refs (user_id, recipe_id, note) values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-0000000000a1', 'nota privada de A')
on conflict (user_id, recipe_id) do nothing;

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

with u as (
  update recipe_steps set text = 'hijacked'
   where recipe_id = '00000000-0000-0000-0000-0000000000a1' returning 1
)
select is(count(*)::int, 0, 'B cannot UPDATE a step of A''s recipe') from u;

select throws_ok(
  $q$ update recipe_steps set recipe_id = '00000000-0000-0000-0000-0000000000a1'
       where recipe_id = '00000000-0000-0000-0000-0000000000b1' $q$,
  '42501', NULL, 'B cannot re-point its own step into A''s recipe');

with d as (
  delete from recipe_steps
   where recipe_id = '00000000-0000-0000-0000-0000000000a1' returning 1
)
select is(count(*)::int, 0, 'B''s DELETE against A''s steps removes nothing') from d;

-- ── the sentinel (anon-owned) recipe is writable by nobody ───────────────────
-- The interesting attacker here is not B (B already fails the plain
-- `r.created_by_user_id = auth.uid()` match, sentinel clause or not) — it's a
-- session whose OWN auth.uid() equals the sentinel value itself. For that
-- session `r.created_by_user_id = auth.uid()` would MATCH (both sides equal
-- the sentinel uuid): the explicit `<> '00000000-0000-0000-0000-00000000a0a0'`
-- clause is the only thing still blocking it, so a policy that dropped that
-- clause would let this recipe's steps be silently hijacked. A real login can
-- never carry this `sub` (R-01: the value is provably not a
-- `gen_random_uuid()` output), but the R-01 anon seed's `auth.users` row for
-- it makes the JWT claim well-formed enough for RLS to evaluate here.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a0a0","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$ insert into recipe_steps (recipe_id, display_order, text)
      values ('00000000-0000-0000-0000-0000000000c1', 1, 'intruder') $q$,
  '42501', NULL, 'the sentinel session cannot INSERT a step into the sentinel-owned recipe');

with u as (
  update recipe_steps set text = 'hijacked'
   where recipe_id = '00000000-0000-0000-0000-0000000000c1' returning 1
)
select is(count(*)::int, 0, 'the sentinel session cannot UPDATE a step of the sentinel-owned recipe') from u;

with d as (
  delete from recipe_steps
   where recipe_id = '00000000-0000-0000-0000-0000000000c1' returning 1
)
select is(count(*)::int, 0, 'the sentinel session''s DELETE against the sentinel-owned recipe''s steps removes nothing') from d;

-- ── owner can still mutate its own steps (act as A) ───────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

with u as (
  update recipe_steps set text = 'A step one, edited'
   where recipe_id = '00000000-0000-0000-0000-0000000000a1' returning 1
)
select is(count(*)::int, 1, 'A can UPDATE its own recipe''s steps') from u;

with d as (
  delete from recipe_steps
   where recipe_id = '00000000-0000-0000-0000-0000000000a1' returning 1
)
select is(count(*)::int, 1, 'A can DELETE its own recipe''s steps') from d;

-- back to B for the save_recipe block below (its calls target B's own recipe)
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

-- ── save_recipe replaces the whole step set, in array order ──────────────────
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'recipes'
      and column_name = 'instructions'),
  0, 'recipes.instructions column is gone');

-- JSON array order deliberately differs from display_order: if the RPC ever
-- hardcoded display_order (dropping the payload's values, so every row ties
-- at 0), array_agg would fall back to insertion order and coincidentally
-- match an in-order payload. Out-of-order input closes that hole.
select public.save_recipe(
  '00000000-0000-0000-0000-0000000000b1',
  'B recipe', 2, null,
  '[]'::jsonb,
  '[{"text":"paso dos","display_order":1},{"text":"paso uno","display_order":0}]'::jsonb
);

select is(
  (select array_agg(text order by display_order) from public.recipe_steps
     where recipe_id = '00000000-0000-0000-0000-0000000000b1'),
  array['paso uno', 'paso dos'],
  'save_recipe inserts steps in display_order');

select is(
  (select array_agg(display_order order by display_order) from public.recipe_steps
     where recipe_id = '00000000-0000-0000-0000-0000000000b1'),
  array[0, 1],
  'save_recipe stores the payload''s display_order values, not a hardcoded one');

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

-- whitespace-only step text is dropped, not stored as an empty step
select public.save_recipe(
  '00000000-0000-0000-0000-0000000000b1',
  'B recipe', 2, null,
  '[]'::jsonb,
  '[{"text":"real step","display_order":0},{"text":"   ","display_order":1}]'::jsonb
);

select is(
  (select array_agg(text order by display_order) from public.recipe_steps
     where recipe_id = '00000000-0000-0000-0000-0000000000b1'),
  array['real step'],
  'save_recipe drops blank/whitespace-only steps');

-- R-36: regression guard on the PII firewall — B still has no membership row
-- for A's recipe, so B's (RLS-scoped) view of user_recipe_refs cannot surface
-- A's private note, even though B can freely SELECT A's recipe/steps (shared
-- pool). This locks down EXISTING `user_recipe_refs` RLS rather than asserting
-- new behaviour.
select is(
  (select count(*)::int from public.user_recipe_refs
     where recipe_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'B cannot see A''s recipe ref, so cannot read A''s private note');

select * from finish();
rollback;
