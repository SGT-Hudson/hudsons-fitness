-- Tier-3 / R-16 — RLS on the shared library pool (ingredients, exercises) and
-- the per-user PII reference tables. Pool rows are world-readable to any
-- authenticated user; only the real owner can mutate; system seeds (NULL owner)
-- and anon-owned rows (sentinel 00000000-0000-0000-0000-00000000a0a0) are
-- immutable. Reference rows are strictly per-user.

begin;
select * from no_plan();

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev');

-- pool seeds: a system row (NULL owner) and an anon-owned row
insert into ingredients (id, created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit) values
  ('00000000-0000-0000-0000-0000000000d0', NULL,                                     'Sistema',  1.0, 0.1, 0.1, 0.1),
  ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-00000000a0a0',   'Anonimo',  1.0, 0.1, 0.1, 0.1);
insert into exercises (id, created_by_user_id, name_es) values
  ('00000000-0000-0000-0000-0000000000e0', NULL, 'Sentadilla');

-- ── act as A ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- pool is world-readable
select is((select count(*)::int from ingredients where id = '00000000-0000-0000-0000-0000000000d0'),
          1, 'A can SELECT a system-seed ingredient');
select is((select count(*)::int from exercises where id = '00000000-0000-0000-0000-0000000000e0'),
          1, 'A can SELECT a system-seed exercise');

-- A creates its own pool item (self-tag permitted)
select lives_ok(
  $q$ insert into ingredients (id, created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit)
      values ('00000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','Mio',1,0.1,0.1,0.1) $q$,
  'A can INSERT an ingredient it owns');
-- but cannot self-tag as another user
select throws_ok(
  $q$ insert into ingredients (created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit)
      values ('22222222-2222-2222-2222-222222222222','Robado',1,0.1,0.1,0.1) $q$,
  '42501', NULL, 'A cannot INSERT an ingredient tagged as B');

-- system seed + anon-owned rows are immutable to A
select is((with u as (update ingredients set name = 'x' where id = '00000000-0000-0000-0000-0000000000d0' returning 1)
           select count(*)::int from u),
          0, 'A cannot UPDATE a system-seed ingredient');
select is((with u as (update ingredients set name = 'x' where id = '00000000-0000-0000-0000-0000000000da' returning 1)
           select count(*)::int from u),
          0, 'A cannot UPDATE an anon-owned ingredient');
select is((with d as (delete from ingredients where id = '00000000-0000-0000-0000-0000000000d0' returning 1)
           select count(*)::int from d),
          0, 'A cannot DELETE a system-seed ingredient');

-- A keeps a private reference row
insert into user_ingredient_refs (user_id, ingredient_id)
  values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000d0');

-- ── act as B ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

-- B cannot mutate A's pool item
select is((with u as (update ingredients set name = 'x' where id = '00000000-0000-0000-0000-0000000000a1' returning 1)
           select count(*)::int from u),
          0, 'B cannot UPDATE an ingredient owned by A');
select is((with d as (delete from ingredients where id = '00000000-0000-0000-0000-0000000000a1' returning 1)
           select count(*)::int from d),
          0, 'B cannot DELETE an ingredient owned by A');
-- B cannot see A's private reference rows
select is((select count(*)::int from user_ingredient_refs
            where user_id = '11111111-1111-1111-1111-111111111111'),
          0, 'B cannot SELECT A''s ingredient reference rows');

-- ── owner can still mutate (act as A) ────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((with u as (update ingredients set name = 'Mio2' where id = '00000000-0000-0000-0000-0000000000a1' returning 1)
           select count(*)::int from u),
          1, 'A can UPDATE its own ingredient');

select * from finish();
rollback;
