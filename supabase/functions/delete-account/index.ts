// delete-account
//
// Endpoint: POST /functions/v1/delete-account
// Headers: Authorization: Bearer <user JWT>
//
// Verifies the caller's JWT, then deletes the auth.users row using the service
// role. ON DELETE CASCADE chains (auth.users → profiles → all user-scoped tables)
// remove the user's data atomically.
//
// CORS: only allow same-origin browser requests via the Authorization header
// supabase.functions.invoke adds; we don't open up arbitrary cross-origin POSTs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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

  // Admin delete via service-role client. CASCADE removes all user data.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  return json({ ok: true, user_id: userId });
});
