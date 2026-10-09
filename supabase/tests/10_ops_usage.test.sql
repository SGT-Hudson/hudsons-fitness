-- Tier-3 — ops.usage(p_from, p_to): the usage totals read by the hudsn-ops
-- admin panel through the `hudsn_ops` role. Aggregates only; the role can run
-- this one function and read no table.
--
-- The fixture lives in January 2020 so rows already in the local database
-- (seed users, the library sentinel) fall outside every window asserted here.

begin;
select * from no_plan();

insert into auth.users (id, email, email_confirmed_at, created_at, last_sign_in_at) values
  ('0e5c0000-0000-4000-8000-000000000001', 'ops-u1@example.com', '2020-01-02', '2020-01-02', '2020-01-05'),
  ('0e5c0000-0000-4000-8000-000000000002', 'ops-u2@example.com', null,         '2020-01-03', '2020-01-05');

-- The library sentinel (R-01) is confirmed and "created" inside the window:
-- it must still not count as an account.
update auth.users
   set email_confirmed_at = '2020-01-02', created_at = '2020-01-02', last_sign_in_at = '2020-01-05'
 where id = '00000000-0000-0000-0000-00000000a0a0';

-- on_auth_user_created creates the profile rows the FKs below need.
insert into public.meal_logs (user_id, logged_on, custom_name, custom_kcal, from_plan, created_at) values
  ('0e5c0000-0000-4000-8000-000000000001', '2020-01-05', 'x', 100, false, '2020-01-05'),
  ('0e5c0000-0000-4000-8000-000000000001', '2020-01-05', 'y', 100, true,  '2020-01-05');
insert into public.workout_sessions (user_id, performed_on, created_at) values
  ('0e5c0000-0000-4000-8000-000000000001', '2020-01-04', '2020-01-04');
insert into public.body_measurements (user_id, measured_on, created_at) values
  ('0e5c0000-0000-4000-8000-000000000001', '2020-01-03', '2020-01-03');

select is((ops.usage('2020-01-01', '2020-01-08')->>'new_accounts')::int, 1, 'unconfirmed sign-ups and the sentinel do not count');
select is((ops.usage('2020-01-01', '2020-01-08')->>'active_window')::int, 1, 'active in the window');
select is(ops.usage('2020-01-01', '2020-01-08')->'actions',
          '{"meals_logged": 1, "workouts": 1, "measurements": 1}'::jsonb, 'hand-logged meals, workouts, measurements');
select is(ops.usage('2020-01-01', '2020-01-08')->'extra', '{}'::jsonb, 'extra is empty');
select ok(has_function_privilege('hudsn_ops', 'ops.usage(timestamptz,timestamptz)', 'execute'), 'hudsn_ops can execute');
select ok(not has_function_privilege('anon', 'ops.usage(timestamptz,timestamptz)', 'execute'), 'anon cannot execute');
select ok(not has_function_privilege('authenticated', 'ops.usage(timestamptz,timestamptz)', 'execute'), 'authenticated cannot execute');
-- pg_cron grants SELECT on cron.job and cron.job_run_details to PUBLIC. Both
-- are row-level-secured to the caller's own jobs (hudsn_ops owns none) and the
-- role has no USAGE on schema cron, so they are unreachable; allowlisted by
-- exact name below and the unreachability asserted right after. Never revoked.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname in ('public', 'auth', 'storage', 'vault', 'private', 'cron', 'ops') and c.relkind in ('r', 'v', 'm', 'p', 'f')
             and not (n.nspname = 'cron' and c.relname in ('job', 'job_run_details'))
             and has_table_privilege('hudsn_ops', c.oid, 'select')), 0, 'hudsn_ops reads no table');
select ok(not has_schema_privilege('hudsn_ops', 'cron', 'usage'), 'hudsn_ops cannot reach the pg_cron tables');

select * from finish();
rollback;
