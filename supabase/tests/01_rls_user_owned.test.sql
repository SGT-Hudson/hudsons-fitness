-- Tier-3 / R-16 — RLS isolation on user-owned tables (auth.uid() = user_id).
-- Representative distinct shapes: body_measurements (full CRUD), profiles,
-- workout_sessions, programs, goals. The auth context is switched inline
-- (set_config for the JWT claim + `set local role authenticated`); `reset role`
-- returns to the privileged setup context. auth.uid() reads request.jwt.claims.

begin;
select * from no_plan();

-- Two real users (the signup trigger auto-creates their profiles rows).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev');

-- ── body_measurements — full CRUD isolation ──────────────────────────────────
-- A creates own row (INSERT WITH CHECK permits self).
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $q$ insert into body_measurements (user_id, measured_on)
      values ('11111111-1111-1111-1111-111111111111', '2026-01-01') $q$,
  'A can insert its own body_measurement'
);

-- B sees/touches none of A's data.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from body_measurements
    where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'B cannot SELECT A body_measurement');
with u as (update body_measurements set measured_on = measured_on
            where user_id = '11111111-1111-1111-1111-111111111111' returning 1)
select is(count(*)::int, 0, 'B UPDATE of A body_measurement affects 0 rows') from u;
with d as (delete from body_measurements
            where user_id = '11111111-1111-1111-1111-111111111111' returning 1)
select is(count(*)::int, 0, 'B DELETE of A body_measurement affects 0 rows') from d;
select throws_ok(
  $q$ insert into body_measurements (user_id, measured_on)
      values ('11111111-1111-1111-1111-111111111111', '2026-03-03') $q$,
  '42501', NULL, 'B cannot INSERT a body_measurement tagged as A');

-- A can mutate its own row.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
with u as (update body_measurements set measured_on = measured_on
            where user_id = '11111111-1111-1111-1111-111111111111' returning 1)
select is(count(*)::int, 1, 'A can UPDATE its own body_measurement') from u;

-- ── profiles — SELECT isolation ──────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from profiles where id = '11111111-1111-1111-1111-111111111111'),
  0, 'B cannot SELECT A profile');
select is(
  (select count(*)::int from profiles where id = '22222222-2222-2222-2222-222222222222'),
  1, 'B can SELECT its own profile');

-- ── workout_sessions — cross-user denial ─────────────────────────────────────
reset role;  -- seed an A-owned session as the privileged setup role
insert into workout_sessions (user_id) values ('11111111-1111-1111-1111-111111111111');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from workout_sessions
    where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'B cannot SELECT A workout_session');
select throws_ok(
  $q$ insert into workout_sessions (user_id)
      values ('11111111-1111-1111-1111-111111111111') $q$,
  '42501', NULL, 'B cannot INSERT a workout_session tagged as A');

-- ── programs & goals — INSERT WITH CHECK denial ──────────────────────────────
select throws_ok(
  $q$ insert into programs (user_id, name)
      values ('11111111-1111-1111-1111-111111111111', 'stolen') $q$,
  '42501', NULL, 'B cannot INSERT a program tagged as A');
select throws_ok(
  $q$ insert into goals (user_id)
      values ('11111111-1111-1111-1111-111111111111') $q$,
  '42501', NULL, 'B cannot INSERT a goal tagged as A');
-- own program is allowed
select lives_ok(
  $q$ insert into programs (user_id, name)
      values ('22222222-2222-2222-2222-222222222222', 'mine') $q$,
  'B can INSERT its own program');

select * from finish();
rollback;
