-- Usage totals for the hudsn-ops admin panel.
-- Spec: SGT-Hudson/hudsn-ops docs/superpowers/specs/2026-10-08-panel-design.md
--
-- ops.usage(p_from, p_to) returns one jsonb document of counts: accounts, new
-- and active accounts, and a few hand-logged action totals. Aggregates only —
-- no row, id or email ever leaves it.
--
-- SECURITY DEFINER exception (see data-model.md): it must read auth.users,
-- auth.sessions and the user-owned tables across every user, which RLS would
-- hide from the caller. It stays safe because it lives in its own schema
-- (`ops`, not exposed through the Data API), returns aggregates only, pins
-- `search_path = ''` with every name schema-qualified, and is executable only
-- by `hudsn_ops`. That role is created NOLOGIN here; it holds no grant on any
-- table the app owns and has no Data API access. Like every role it inherits
-- the SELECT that Supabase and its extensions (pg_cron, pg_net,
-- pg_stat_statements) grant to PUBLIC; those are left as they are (the pg_cron
-- ones are unreachable: no USAGE on schema cron). Its password and LOGIN are
-- set by hand in production, so nothing secret lives in the repo.
--
-- An account is a confirmed email, minus the library sentinel (R-01). Last
-- activity is the later of last_sign_in_at and the newest auth.sessions
-- timestamp (refreshed_at is `timestamp without time zone`, UTC).
create schema if not exists ops;
revoke all on schema ops from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hudsn_ops') then
    create role hudsn_ops nologin;
  end if;
end $$;

create or replace function ops.usage(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select u.id, u.created_at,
      greatest(
        u.last_sign_in_at,
        (select max(greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC'))
           from auth.sessions s where s.user_id = u.id)
      ) as last_seen
    from auth.users u
    where u.email_confirmed_at is not null
      and u.id <> '00000000-0000-0000-0000-00000000a0a0'
  )
  select jsonb_build_object(
    'accounts', (select count(*) from people),
    'new_accounts', (select count(*) from people where created_at >= p_from and created_at < p_to),
    'active_1d', (select count(*) from people where last_seen > p_to - interval '1 day' and last_seen <= p_to),
    'active_7d', (select count(*) from people where last_seen > p_to - interval '7 days' and last_seen <= p_to),
    'active_30d', (select count(*) from people where last_seen > p_to - interval '30 days' and last_seen <= p_to),
    'active_window', (select count(*) from people where last_seen >= p_from and last_seen < p_to),
    'actions', jsonb_build_object(
      'meals_logged', (select count(*) from public.meal_logs m join people p on p.id = m.user_id
                        where m.from_plan = false and m.created_at >= p_from and m.created_at < p_to),
      'workouts', (select count(*) from public.workout_sessions w join people p on p.id = w.user_id
                    where w.created_at >= p_from and w.created_at < p_to),
      'measurements', (select count(*) from public.body_measurements b join people p on p.id = b.user_id
                        where b.created_at >= p_from and b.created_at < p_to)
    ),
    'extra', '{}'::jsonb
  );
$$;

revoke all on function ops.usage(timestamptz, timestamptz) from public, anon, authenticated;
grant usage on schema ops to hudsn_ops;
grant execute on function ops.usage(timestamptz, timestamptz) to hudsn_ops;
