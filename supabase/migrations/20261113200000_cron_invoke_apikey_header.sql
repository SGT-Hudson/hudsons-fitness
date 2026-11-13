-- Cron → edge functions on the new API keys.
--
-- Supabase retires the legacy JWT API keys (`anon`, `service_role`) in late
-- 2026. The cron path was the last user of the legacy `service_role` JWT:
-- `private.invoke_edge_function` sent the Vault secret `cron_service_role_key`
-- as `Authorization: Bearer`. The replacement `sb_secret_` key is not a JWT,
-- so the gateway rejects it there; it goes on the `apikey` header instead.
-- The cron edge functions run with `verify_jwt = false` and check that header
-- themselves (`isServerCall`, supabase/functions/_shared/keys.ts).
--
-- Order in production (2026-11-13): deploy the edge functions with the in-code
-- check first, then apply this migration, then set the Vault secret to the
-- project's `sb_secret_` key. The secret is set out of band
-- (`vault.update_secret`, see docs/operations.md → Cron → Auth); its value
-- never appears in a migration, because migration history stores the
-- statement text. The secret keeps its name.
--
-- Same signature, security and grants as before; only the header changes.

create or replace function private.invoke_edge_function(function_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id bigint;
  v_cron_key text;
  v_project_url constant text := 'https://upvraruehzurbetzrxov.supabase.co';
begin
  select decrypted_secret into v_cron_key
    from vault.decrypted_secrets
    where name = 'cron_service_role_key'
    limit 1;

  if v_cron_key is null then
    raise exception 'Vault secret cron_service_role_key not set; run vault.create_secret(<sb_secret key>, ''cron_service_role_key'')';
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'apikey', v_cron_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.invoke_edge_function(text) from public, anon, authenticated;
