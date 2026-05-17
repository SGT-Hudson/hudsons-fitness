// recalculate-tdee
//
// Cron: 0 3 * * * UTC (≈ 04:00 CET / 05:00 CEST — runs after the daily
// snapshot job at 01:00 UTC so the freshest day is included).
//
// For each profile with at least one phase, computes a TDEE estimate over
// the most recent 14-day window using consumed_kcal from
// daily_nutrition_history and weight_kg from body_measurements.
//
//   TDEE ≈ avg_intake_kcal − (Δweight_kg · 7700 / window_days)
//
// 7700 kcal/kg is the standard "1 kg of fat ≈ 7700 kcal" approximation. We
// require at least 10 days of intake data and at least one weight measurement
// near each end of the window — otherwise the estimate would be too noisy and
// we skip the user. Result is upserted into tdee_estimates(user_id, computed_on).

// Version pinned once in supabase/functions/deno.json (D-F3 / R-17).
import { createClient } from '@supabase/supabase-js';
// Date/TZ helper from the shared pure core, re-exported via _shared (D-F3 / R-17).
import { previousDayInTZ } from '../_shared/macros.ts';

const WINDOW_DAYS = 14;
const MIN_INTAKE_DAYS = 10;
const KCAL_PER_KG_FAT = 7700;
// Accept a weight measurement up to ±3 days from the window edge.
const WEIGHT_TOLERANCE_DAYS = 3;

function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: { date?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const computedOn = body.date ?? previousDayInTZ();
  const windowStart = addDaysISO(computedOn, -(WINDOW_DAYS - 1));
  const weightWindowStart = addDaysISO(windowStart, -WEIGHT_TOLERANCE_DAYS);
  const weightWindowEnd = addDaysISO(computedOn, WEIGHT_TOLERANCE_DAYS);

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
    status: 'ok' | 'no_phase' | 'insufficient_intake' | 'insufficient_weights' | 'error';
    estimated_tdee_kcal?: number;
    error?: string;
  }> = [];

  for (const profile of profiles ?? []) {
    try {
      // Only compute for users that have at least one phase (signal that
      // they're actively tracking). Without a phase, TDEE has no consumer.
      const { count: phaseCount } = await supabase
        .from('phases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id);
      if (!phaseCount || phaseCount === 0) {
        results.push({ user_id: profile.id, status: 'no_phase' });
        continue;
      }

      const { data: history, error: historyError } = await supabase
        .from('daily_nutrition_history')
        .select('consumed_kcal')
        .eq('user_id', profile.id)
        .gte('logged_on', windowStart)
        .lte('logged_on', computedOn)
        .not('consumed_kcal', 'is', null);
      if (historyError) throw historyError;

      const intakeValues = (history ?? [])
        .map((row) => Number(row.consumed_kcal))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (intakeValues.length < MIN_INTAKE_DAYS) {
        results.push({ user_id: profile.id, status: 'insufficient_intake' });
        continue;
      }
      const avgIntake = intakeValues.reduce((s, n) => s + n, 0) / intakeValues.length;

      const { data: weights, error: weightsError } = await supabase
        .from('body_measurements')
        .select('measured_on, weight_kg')
        .eq('user_id', profile.id)
        .gte('measured_on', weightWindowStart)
        .lte('measured_on', weightWindowEnd)
        .not('weight_kg', 'is', null)
        .order('measured_on', { ascending: true });
      if (weightsError) throw weightsError;

      const weightStart = pickClosest(weights ?? [], windowStart);
      const weightEnd = pickClosest(weights ?? [], computedOn);
      if (
        !weightStart ||
        !weightEnd ||
        weightStart.measured_on === weightEnd.measured_on
      ) {
        results.push({ user_id: profile.id, status: 'insufficient_weights' });
        continue;
      }

      const weightDelta = Number(weightEnd.weight_kg) - Number(weightStart.weight_kg);
      const tdee = avgIntake - (weightDelta * KCAL_PER_KG_FAT) / WINDOW_DAYS;

      const { error: upsertError } = await supabase
        .from('tdee_estimates')
        .upsert(
          {
            user_id: profile.id,
            computed_on: computedOn,
            window_days: WINDOW_DAYS,
            avg_kcal_intake: round1(avgIntake),
            weight_delta_kg: round2(weightDelta),
            estimated_tdee_kcal: round1(tdee),
          },
          { onConflict: 'user_id,computed_on' },
        );
      if (upsertError) throw upsertError;

      results.push({
        user_id: profile.id,
        status: 'ok',
        estimated_tdee_kcal: round1(tdee),
      });
    } catch (err) {
      results.push({
        user_id: profile.id,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(
    JSON.stringify({
      computed_on: computedOn,
      window: { start: windowStart, end: computedOn, days: WINDOW_DAYS },
      results,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

function pickClosest(
  rows: Array<{ measured_on: string; weight_kg: number | string | null }>,
  target: string,
): { measured_on: string; weight_kg: number | string | null } | null {
  if (rows.length === 0) return null;
  const targetMs = Date.parse(target + 'T00:00:00Z');
  let best = rows[0];
  let bestDist = Math.abs(Date.parse(best.measured_on + 'T00:00:00Z') - targetMs);
  for (let i = 1; i < rows.length; i++) {
    const d = Math.abs(Date.parse(rows[i].measured_on + 'T00:00:00Z') - targetMs);
    if (d < bestDist) {
      best = rows[i];
      bestDist = d;
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
