// weekly-rollover
//
// Cron: 0 2 * * 1 UTC (Mon ≈ 03:00 CET / 04:00 CEST).
//
// For each profile, ensure a meal_plan_weeks row exists for the current Madrid
// Monday. If missing and the most recent prior week has a source_template_id,
// re-apply that template via private.apply_template_to_week_admin (the
// service-role variant of apply_template_to_week — the public RPC reads
// auth.uid() which is null in this context).
//
// POST body may include `{ "week_start": "YYYY-MM-DD" }` to target a specific
// Monday; otherwise defaults to today's Monday in Europe/Madrid.

// Version pinned once in supabase/functions/deno.json (D-F3 / R-17).
import { createClient } from '@supabase/supabase-js';
// Date/TZ helper from the shared pure core, re-exported via _shared (D-F3 / R-17).
import { mondayOfTodayInTZ } from '../_shared/macros.ts';

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: { week_start?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const weekStart = body.week_start ?? mondayOfTodayInTZ();

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id');
  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{
    user_id: string;
    status: 'already_exists' | 'rolled_over' | 'no_template' | 'error';
    week_id?: string;
    template_id?: string;
    error?: string;
  }> = [];

  for (const profile of profiles ?? []) {
    try {
      const { data: existing } = await supabase
        .from('meal_plan_weeks')
        .select('id')
        .eq('user_id', profile.id)
        .eq('week_start', weekStart)
        .maybeSingle();
      if (existing) {
        results.push({ user_id: profile.id, status: 'already_exists', week_id: existing.id });
        continue;
      }

      const { data: prev } = await supabase
        .from('meal_plan_weeks')
        .select('source_template_id')
        .eq('user_id', profile.id)
        .lt('week_start', weekStart)
        .not('source_template_id', 'is', null)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!prev?.source_template_id) {
        results.push({ user_id: profile.id, status: 'no_template' });
        continue;
      }

      const { data: weekId, error: rpcError } = await supabase.rpc(
        'apply_template_to_week_admin',
        {
          p_user_id: profile.id,
          p_template_id: prev.source_template_id,
          p_target_date: weekStart,
        },
      );
      if (rpcError) throw rpcError;

      results.push({
        user_id: profile.id,
        status: 'rolled_over',
        week_id: weekId as unknown as string,
        template_id: prev.source_template_id,
      });
    } catch (err) {
      results.push({
        user_id: profile.id,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(JSON.stringify({ week_start: weekStart, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
