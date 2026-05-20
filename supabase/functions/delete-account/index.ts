// delete-account
//
// Endpoint: POST /functions/v1/delete-account
// Headers: Authorization: Bearer <user JWT>
//
// Verifies the caller's JWT, runs the R-01 reconciliation
// (`private.reconcile_account_delete`) via the service role to (1) erase
// the user's `user_*_refs` rows — the PII firewall — and (2) reassign any
// pool items still owned by the user to the anon sentinel, and THEN
// deletes the auth.users row. The remaining CASCADE chain
// (auth.users → profiles → all user-scoped tables) removes only genuinely
// user-private rows — `ingredients`/`recipes` are no longer owned by the
// user so nothing of theirs cascades there. See:
//   - docs/superpowers/specs/2026-05-18-library-model-phase1-design.md §8
//   - supabase/migrations/20260520120060_r01_account_delete_reconcile.sql
//
// Reconciliation runs BEFORE the auth user delete. If reconciliation fails,
// we abort and do NOT delete the auth user — partial erasure would leave
// the user's data inconsistent (refs gone but pool items still
// user-owned, or vice versa). The caller can retry safely (the
// reconciliation RPC is idempotent on p_user_id).
//
// CORS: only allow same-origin browser requests via the Authorization
// header supabase.functions.invoke adds; we don't open up arbitrary
// cross-origin POSTs.

// Version pinned once in supabase/functions/deno.json (D-F3 / R-17).
import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'missing_env' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'missing_authorization' }, 401);
  }

  // Verify the caller's JWT against auth.users using the anon key client.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult?.user) {
    return json({ error: 'invalid_token' }, 401);
  }
  const userId = userResult.user.id;

  // Service-role client; needed for both the reconciliation RPC and the
  // auth-admin delete. Service role bypasses RLS and the `private` schema
  // grants on `reconcile_account_delete`.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // R-01 (spec §8) — reconcile BEFORE auth-delete.
  // The RPC lives in `public`, granted to ONLY `service_role` (the same
  // pattern as `apply_template_to_week_admin`). Idempotent on p_user_id
  // so a retry after a transient network failure is safe.
  // `as unknown as never` keeps the loosely-typed `rpc` call happy
  // against the public-only generated types (the function exists in the
  // DB; we just don't surface it to client-facing types because the
  // client can't call it without the service-role key).
  const { error: reconcileError } = await (
    admin.rpc as (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  )('reconcile_account_delete', { p_user_id: userId });
  if (reconcileError) {
    // Do NOT delete the auth user — partial erasure is worse than no
    // erasure (the user is left with refs but no auth, or pool items
    // still user-owned with no owner to manage them).
    return json({ error: 'reconcile_failed', detail: reconcileError.message }, 500);
  }

  // Only now: admin delete via service-role. CASCADE removes the
  // remaining user-private data (profiles, phases, meal_logs, body
  // measurements, plan weeks, templates, tdee state, etc.).
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  return json({ ok: true, user_id: userId });
});
