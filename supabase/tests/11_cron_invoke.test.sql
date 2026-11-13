-- Tier-3 — private.invoke_edge_function: the cron helper sends the Vault key
-- on the `apikey` header and never as `Authorization: Bearer` (a `sb_secret_`
-- key is not a JWT; the gateway rejects it as a Bearer token).
--
-- pg_net queues the request in net.http_request_queue; inside this
-- rolled-back transaction its worker never sees the row, so nothing is sent.

begin;
select plan(5);

select throws_ok(
  $$ select private.invoke_edge_function('cron-healthcheck') $$,
  'P0001',
  null,
  'raises while the Vault secret is not set'
);

select vault.create_secret('sb_secret_pgtapFAKEpgtapFAKE', 'cron_service_role_key');

create temp table req as
  select private.invoke_edge_function('cron-healthcheck') as id;

select is(
  (select q.url from net.http_request_queue q join req on q.id = req.id),
  'https://upvraruehzurbetzrxov.supabase.co/functions/v1/cron-healthcheck',
  'posts to the edge function URL'
);

select is(
  (select q.headers ->> 'apikey' from net.http_request_queue q join req on q.id = req.id),
  'sb_secret_pgtapFAKEpgtapFAKE',
  'sends the Vault key on the apikey header'
);

select ok(
  (select not (q.headers ? 'Authorization') and not (q.headers ? 'authorization')
     from net.http_request_queue q join req on q.id = req.id),
  'sends no Authorization header'
);

select is(
  (select q.method from net.http_request_queue q join req on q.id = req.id),
  'POST',
  'is a POST'
);

select * from finish();
rollback;
