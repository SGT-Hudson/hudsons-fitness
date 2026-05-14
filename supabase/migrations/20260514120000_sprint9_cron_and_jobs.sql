-- Sprint 9: Edge Functions + pg_cron
--
-- 1. Enable pg_cron + pg_net (extensions schema)
-- 2. Add UNIQUE constraint on tdee_estimates(user_id, computed_on) so the
--    edge function can upsert idempotently.
-- 3. Create a private admin RPC apply_template_to_week_admin(p_user_id, ...)
--    callable from the weekly-rollover edge function (which uses service role
--    and therefore has no auth.uid()).
-- 4. Provide private.invoke_edge_function(name) — reads service_role_key from
--    Vault and POSTs to /functions/v1/<name>. Project URL is hardcoded; only
--    the service-role key is secret.
-- 5. Schedule the three cron jobs.
--
-- Operator one-time setup (must run manually in SQL editor before cron starts):
--   select vault.create_secret('<service_role_key>', 'cron_service_role_key');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

alter table public.tdee_estimates
  add constraint tdee_estimates_user_id_computed_on_key
  unique (user_id, computed_on);

create schema if not exists private;
revoke all on schema private from public;

-- Admin variant of apply_template_to_week. Same body as the public RPC but
-- takes p_user_id explicitly instead of reading auth.uid(). SECURITY DEFINER
-- so it can write across users; only service_role may execute.
--
-- Lives in `public` (not `private`) because PostgREST — and therefore
-- supabase-js .rpc() — only exposes functions in schemas listed in the API
-- config (public, graphql_public). Privacy is enforced by grants instead of
-- by schema.
create or replace function public.apply_template_to_week_admin(
  p_user_id uuid,
  p_template_id uuid,
  p_target_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week_start date;
  v_week_id uuid;
  v_template_default_times time[];
  v_d date;
  v_dow int;
  v_meal_times time[];
begin
  select default_meal_times into v_template_default_times
    from public.meal_plan_templates
    where id = p_template_id and user_id = p_user_id;
  if v_template_default_times is null then
    raise exception 'template not found for user %', p_user_id;
  end if;

  v_week_start := (p_target_date - ((extract(isodow from p_target_date)::int - 1)))::date;

  insert into public.meal_plan_weeks (user_id, week_start, source_template_id, has_diverged)
  values (p_user_id, v_week_start, p_template_id, false)
  on conflict (user_id, week_start) do update
    set source_template_id = excluded.source_template_id,
        has_diverged = false,
        updated_at = now()
  returning id into v_week_id;

  delete from public.meal_plan_week_slots
    where plan_week_id = v_week_id and date >= p_target_date;

  v_d := p_target_date;
  while v_d <= v_week_start + 6 loop
    v_dow := extract(isodow from v_d)::int - 1;

    select meal_times into v_meal_times
      from public.meal_plan_template_day_times
      where template_id = p_template_id and day_of_week = v_dow;
    if v_meal_times is null then
      v_meal_times := v_template_default_times;
    end if;

    insert into public.meal_plan_week_slots
      (plan_week_id, date, meal_index, meal_time, recipe_id, servings, display_order)
    select v_week_id, v_d, ts.meal_index,
           v_meal_times[ts.meal_index + 1],
           ts.recipe_id, ts.servings, ts.display_order
    from public.meal_plan_template_slots ts
    where ts.template_id = p_template_id and ts.day_of_week = v_dow;

    v_d := v_d + 1;
  end loop;

  return v_week_id;
end;
$$;

revoke all on function public.apply_template_to_week_admin(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.apply_template_to_week_admin(uuid, uuid, date) to service_role;

-- Helper: cron jobs invoke this; it reads the secret from Vault and POSTs.
create or replace function private.invoke_edge_function(function_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id bigint;
  v_service_role_key text;
  v_project_url constant text := 'https://upvraruehzurbetzrxov.supabase.co';
begin
  select decrypted_secret into v_service_role_key
    from vault.decrypted_secrets
    where name = 'cron_service_role_key'
    limit 1;

  if v_service_role_key is null then
    raise exception 'Vault secret cron_service_role_key not set; run vault.create_secret(<service_role_key>, ''cron_service_role_key'')';
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.invoke_edge_function(text) from public, anon, authenticated;

-- Schedules (UTC). Times target Madrid (CET/CEST) approximately:
--   01:00 UTC = 02:00 CET / 03:00 CEST  → daily snapshot
--   02:00 UTC Mon = 03:00 CET / 04:00 CEST → weekly rollover
--   03:00 UTC = 04:00 CET / 05:00 CEST → recalculate TDEE (after snapshot)
-- DST is not corrected for; all jobs are off-peak so a 1h shift is fine.

select cron.schedule(
  'daily-nutrition-snapshot',
  '0 1 * * *',
  $cron$ select private.invoke_edge_function('daily-nutrition-snapshot'); $cron$
);

select cron.schedule(
  'weekly-rollover',
  '0 2 * * 1',
  $cron$ select private.invoke_edge_function('weekly-rollover'); $cron$
);

select cron.schedule(
  'recalculate-tdee',
  '0 3 * * *',
  $cron$ select private.invoke_edge_function('recalculate-tdee'); $cron$
);
