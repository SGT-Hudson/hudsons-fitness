-- Tier-3 / R-33 wave 6 — the salt sub-macro column on `ingredients`.
-- Salt follows the U-1 nullable sub-macro contract exactly: NULL = UNKNOWN
-- (never 0), and the DB enforces non-negative only. There is no
-- `save_ingredient` RPC — ingredients are written by direct table writes under
-- RLS — so the migration is column-only and RLS on `ingredients` is untouched.

begin;
select * from no_plan();

-- ── the column exists, with the U-1 sub-macro shape ──────────────────────────
select has_column('public', 'ingredients', 'salt_g_per_unit',
  'ingredients.salt_g_per_unit exists');
select col_is_null('public', 'ingredients', 'salt_g_per_unit',
  'salt_g_per_unit is nullable (NULL = unknown, never 0)');
select col_type_is('public', 'ingredients', 'salt_g_per_unit', 'numeric(6,2)',
  'salt_g_per_unit is numeric(6,2), matching sugar/saturated fat');
select col_hasnt_default('public', 'ingredients', 'salt_g_per_unit',
  'salt_g_per_unit has no default (an unimported row is unknown, not 0)');

-- ── the CHECK constraint: null ok, >= 0 ok, negative rejected ────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'salt-a@test.dev');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$ insert into ingredients (id, created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, salt_g_per_unit)
      values ('00000000-0000-0000-0000-0000000005a1','11111111-1111-1111-1111-111111111111','Sal nula',1,0.1,0.1,0.1, NULL) $q$,
  'a NULL salt is accepted (unknown)');

select lives_ok(
  $q$ insert into ingredients (id, created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, salt_g_per_unit)
      values ('00000000-0000-0000-0000-0000000005a2','11111111-1111-1111-1111-111111111111','Sal positiva',1,0.1,0.1,0.1, 1.25) $q$,
  'a positive salt value is accepted');

select lives_ok(
  $q$ insert into ingredients (id, created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, salt_g_per_unit)
      values ('00000000-0000-0000-0000-0000000005a3','11111111-1111-1111-1111-111111111111','Sal cero',1,0.1,0.1,0.1, 0) $q$,
  'an explicit 0 salt is accepted (a real "no salt" claim, distinct from NULL)');

-- 23514 = check_violation
select throws_ok(
  $q$ insert into ingredients (created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, salt_g_per_unit)
      values ('11111111-1111-1111-1111-111111111111','Sal negativa',1,0.1,0.1,0.1, -0.01) $q$,
  '23514', NULL, 'a negative salt value is rejected by the CHECK constraint');

-- and the constraint holds on UPDATE too, not just INSERT
select throws_ok(
  $q$ update ingredients set salt_g_per_unit = -5
       where id = '00000000-0000-0000-0000-0000000005a2' $q$,
  '23514', NULL, 'a negative salt value is rejected on UPDATE');

-- the stored value round-trips (numeric(6,2), no coercion of NULL to 0)
select is(
  (select salt_g_per_unit from ingredients where id = '00000000-0000-0000-0000-0000000005a1'),
  NULL::numeric,
  'a NULL salt stays NULL (it is never coerced to 0)');
select is(
  (select salt_g_per_unit from ingredients where id = '00000000-0000-0000-0000-0000000005a2'),
  1.25::numeric,
  'a positive salt value round-trips');

-- ── RLS on ingredients is unchanged: the pool rules still govern the column ──
-- The migration is column-only, so the owner-write / world-read policies must
-- still apply. Adding a column must not have opened a write path.
reset role;
insert into ingredients (id, created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, salt_g_per_unit) values
  ('00000000-0000-0000-0000-0000000005d0', NULL, 'Sistema con sal', 1, 0.1, 0.1, 0.1, 0.5);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select salt_g_per_unit from ingredients where id = '00000000-0000-0000-0000-0000000005d0'),
  0.5::numeric,
  'salt on a world-readable system row is readable by any authenticated user');
with u as (
  update ingredients set salt_g_per_unit = 9.9
   where id = '00000000-0000-0000-0000-0000000005d0' returning 1)
select is(count(*)::int, 0, 'salt on a system-seed row is NOT writable (RLS unchanged)') from u;

select * from finish();
rollback;
