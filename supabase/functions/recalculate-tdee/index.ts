// recalculate-tdee  (R-07 / D-B4 — adaptive expenditure filter)
//
// Cron: 0 3 * * * UTC (≈ 04:00 CET / 05:00 CEST — runs after the daily
// snapshot job at 01:00 UTC so the freshest day is included). Cadence
// UNCHANGED from the retired two-endpoint model.
//
// This is a DAILY INCREMENTAL update of a persistent per-user adaptive
// filter (a 2-state linear Kalman filter on [trend_weight, expenditure]).
// The 14d/10d/±3d window gating and the 7700-as-headline two-endpoint
// formula are RETIRED (D-B4). 7700 survives only as an internal conversion
// prior inside the pure filter core.
//
// Spec: docs/superpowers/specs/2026-05-18-adaptive-tdee-design.md
// Pure filter math: src/core/tdee.ts (dual-runtime, deterministic, unit
// tested — R-17 discipline; imported here via the same cross-root relative
// path the snapshot fn uses for the macro core, see R-17 follow-up note).
//
// For each profile with ≥1 phase (the "actively tracking" gate — no phase
// ⇒ no TDEE consumer): load tdee_state (or cold-start init), replay every
// calendar day from last_updated_on+1 through the snapshot day (normally
// exactly one day; deterministically catches up after a gap), upsert the
// evolving tdee_state row, and upsert ONE tdee_estimates row for computed_on
// (the unchanged emitted-series the Sprint-17 reader consumes), now also
// carrying the variance-derived `confidence` band + `is_warmup` flag.
//
// STAGED: the matching schema (tdee_state table + confidence/is_warmup
// columns) is in supabase/migrations/20260518020000_r07_adaptive_tdee_state.sql
// and is NOT applied by this PR. This function is deployed at Wave-3.

// Version pinned once in supabase/functions/deno.json (D-F3 / R-17).
import { createClient } from '@supabase/supabase-js';
// Date/TZ helper from the shared pure core, re-exported via _shared (D-F3 / R-17).
import { previousDayInTZ } from '../_shared/macros.ts';
// Pure adaptive-filter core (dual-runtime; relative cross-root import — same
// pattern/limitation as the macro core, tracked under R-17's Wave-3 deploy
// validation note in docs/operations.md).
import {
  initState,
  stepDay,
  confidenceFromState,
  MAX_GAP_DAYS,
  type TdeeState,
  type DayInput,
} from '../../../src/core/tdee.ts';

/** Whole calendar days (to − from) via UTC midnights — DST-immune. */
function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/** Add `delta` whole days to a YYYY-MM-DD date (UTC arithmetic). */
function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Mifflin–St Jeor BMR (kept by D-B5/R-08 as a derived value). */
function mifflinStJeor(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: string | null,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

function ageYearsFrom(birthISO: string | null, asOfISO: string): number {
  if (!birthISO) return 30; // sane default if DOB unknown
  const [by, bm, bd] = birthISO.split('-').map(Number);
  const [ay, am, ad] = asOfISO.split('-').map(Number);
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age -= 1;
  return age > 0 && age < 120 ? age : 30;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
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

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, birth_date, height_cm, sex, initial_weight_kg');
  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{
    user_id: string;
    status: 'ok' | 'no_phase' | 'no_data' | 'error';
    estimated_tdee_kcal?: number;
    confidence?: string;
    is_warmup?: boolean;
    days_advanced?: number;
    error?: string;
  }> = [];

  for (const profile of profiles ?? []) {
    try {
      // Only compute for users with at least one phase (actively tracking).
      const { count: phaseCount } = await supabase
        .from('phases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id);
      if (!phaseCount || phaseCount === 0) {
        results.push({ user_id: profile.id, status: 'no_phase' });
        continue;
      }

      // Load persistent filter state (single row per user).
      const { data: stateRow, error: stateError } = await supabase
        .from('tdee_state')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (stateError) throw stateError;

      // Determine the first day to process.
      let state: TdeeState;
      let processFrom: string; // first calendar day to fold (inclusive)
      let priorUpdatedOn: string | null = stateRow?.last_updated_on ?? null;

      if (stateRow) {
        state = {
          trendWeightKg: Number(stateRow.trend_weight_kg),
          expenditureKcal: Number(stateRow.expenditure_kcal),
          covWW: Number(stateRow.cov_ww),
          covWE: Number(stateRow.cov_we),
          covEE: Number(stateRow.cov_ee),
          observationsCount: Number(stateRow.observations_count),
        };
        const gapSinceState = daysBetweenISO(
          stateRow.last_updated_on,
          computedOn,
        );
        if (gapSinceState <= 0) {
          // Already processed up to (or past) computedOn — idempotent no-op.
          results.push({
            user_id: profile.id,
            status: 'ok',
            estimated_tdee_kcal: round1(state.expenditureKcal),
            ...emitConfidence(state),
            days_advanced: 0,
          });
          continue;
        }

        // Long-gap WARM RESTART (spec §7). After an outage longer than
        // MAX_GAP_DAYS (user away / cron down for months) the prior is so
        // diffuse that day-by-day replay of the whole gap would be absurd
        // extrapolation. Instead apply the pure core's warm-restart in ONE
        // step covering the real gap: re-anchor the trend to the latest
        // weigh-in on/before computedOn, keep expenditure as the best prior
        // but re-inflate its variance, and re-engage the warm-up gate. This
        // is the production path that makes stepDay's warm-restart branch
        // reachable (steady-state cron only ever passes gapDays=1).
        if (gapSinceState > MAX_GAP_DAYS) {
          const { data: anchorRow } = await supabase
            .from('body_measurements')
            .select('measured_on, weight_kg')
            .eq('user_id', profile.id)
            .not('weight_kg', 'is', null)
            .lte('measured_on', computedOn)
            .order('measured_on', { ascending: false })
            .limit(1)
            .maybeSingle();
          const restartWeight =
            anchorRow?.weight_kg != null ? Number(anchorRow.weight_kg) : null;

          state = stepDay(state, {
            intakeKcal: null, // warm-restart branch ignores intake
            weightKg: restartWeight, // re-anchor; null → drift-free carry
            gapDays: gapSinceState,
          });

          const conf = confidenceFromState(state);
          const { error: restartStateError } = await supabase
            .from('tdee_state')
            .upsert(
              {
                user_id: profile.id,
                trend_weight_kg: round4(state.trendWeightKg),
                expenditure_kcal: round4(state.expenditureKcal),
                cov_ww: round4(state.covWW),
                cov_we: round4(state.covWE),
                cov_ee: round4(state.covEE),
                observations_count: state.observationsCount,
                last_updated_on: computedOn,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' },
            );
          if (restartStateError) throw restartStateError;

          const { error: restartEstError } = await supabase
            .from('tdee_estimates')
            .upsert(
              {
                user_id: profile.id,
                computed_on: computedOn,
                window_days: gapSinceState,
                avg_kcal_intake: 0, // no intake folded on a warm restart
                weight_delta_kg: 0, // trend re-anchored, not advanced
                estimated_tdee_kcal: round1(state.expenditureKcal),
                confidence: conf.band,
                is_warmup: conf.isWarmup,
              },
              { onConflict: 'user_id,computed_on' },
            );
          if (restartEstError) throw restartEstError;

          results.push({
            user_id: profile.id,
            status: 'ok',
            estimated_tdee_kcal: round1(state.expenditureKcal),
            confidence: conf.band,
            is_warmup: conf.isWarmup,
            days_advanced: gapSinceState,
          });
          continue;
        }

        processFrom = addDaysISO(stateRow.last_updated_on, 1);
      } else {
        // Cold start. Anchor weight to the earliest weigh-in (fallback to
        // profile.initial_weight_kg); seed expenditure with Mifflin×1.4.
        const { data: firstW } = await supabase
          .from('body_measurements')
          .select('measured_on, weight_kg')
          .eq('user_id', profile.id)
          .not('weight_kg', 'is', null)
          .order('measured_on', { ascending: true })
          .limit(1)
          .maybeSingle();

        const anchorWeight =
          firstW?.weight_kg != null
            ? Number(firstW.weight_kg)
            : profile.initial_weight_kg != null
              ? Number(profile.initial_weight_kg)
              : null;
        if (anchorWeight == null) {
          // No weight ever recorded and no initial weight — nothing to seed.
          results.push({ user_id: profile.id, status: 'no_data' });
          continue;
        }
        const heightCm = profile.height_cm != null ? Number(profile.height_cm) : 170;
        const bmr = mifflinStJeor(
          anchorWeight,
          heightCm,
          ageYearsFrom(profile.birth_date, computedOn),
          profile.sex,
        );
        const e0 = bmr * 1.4; // light-activity TDEE prior (spec §7)
        state = initState(anchorWeight, e0);
        // Begin folding from the first weigh-in date (or, if only an initial
        // weight exists, from computedOn — a single seeding step).
        processFrom = firstW?.measured_on ?? computedOn;
      }

      // Pull intake + raw weigh-ins across the span to replay.
      const { data: history, error: historyError } = await supabase
        .from('daily_nutrition_history')
        .select('logged_on, consumed_kcal')
        .eq('user_id', profile.id)
        .gte('logged_on', processFrom)
        .lte('logged_on', computedOn);
      if (historyError) throw historyError;
      const intakeByDay = new Map<string, number>();
      for (const r of history ?? []) {
        const v = Number(r.consumed_kcal);
        if (Number.isFinite(v) && v > 0) intakeByDay.set(r.logged_on, v);
      }

      const { data: weights, error: weightsError } = await supabase
        .from('body_measurements')
        .select('measured_on, weight_kg')
        .eq('user_id', profile.id)
        .gte('measured_on', processFrom)
        .lte('measured_on', computedOn)
        .not('weight_kg', 'is', null)
        .order('measured_on', { ascending: true });
      if (weightsError) throw weightsError;
      // If multiple weigh-ins on a day, keep the last (latest insert order).
      const weightByDay = new Map<string, number>();
      for (const r of weights ?? []) {
        weightByDay.set(r.measured_on, Number(r.weight_kg));
      }

      // Replay every calendar day processFrom..computedOn inclusive. The
      // first step's gapDays bridges any catch-up from the prior state date;
      // subsequent steps are gapDays = 1. (Steady state: one single day.)
      let cursor = processFrom;
      let first = true;
      let intakeSum = 0;
      let intakeDays = 0;
      const trendAtStart = state.trendWeightKg;
      while (daysBetweenISO(cursor, computedOn) >= 0) {
        const gapDays =
          first && priorUpdatedOn
            ? daysBetweenISO(priorUpdatedOn, cursor)
            : 1;
        const intakeKcal = intakeByDay.has(cursor)
          ? intakeByDay.get(cursor)!
          : null;
        if (intakeKcal != null) {
          intakeSum += intakeKcal;
          intakeDays += 1;
        }
        const dayInput: DayInput = {
          intakeKcal,
          weightKg: weightByDay.has(cursor) ? weightByDay.get(cursor)! : null,
          gapDays: Math.max(1, gapDays),
        };
        state = stepDay(state, dayInput);
        first = false;
        priorUpdatedOn = cursor;
        cursor = addDaysISO(cursor, 1);
      }

      const conf = confidenceFromState(state);
      const daysAdvanced = priorUpdatedOn
        ? daysBetweenISO(
            stateRow?.last_updated_on ?? processFrom,
            computedOn,
          )
        : 0;

      // Upsert the evolving filter memory (one row per user).
      const { error: stateUpsertError } = await supabase
        .from('tdee_state')
        .upsert(
          {
            user_id: profile.id,
            trend_weight_kg: round4(state.trendWeightKg),
            expenditure_kcal: round4(state.expenditureKcal),
            cov_ww: round4(state.covWW),
            cov_we: round4(state.covWE),
            cov_ee: round4(state.covEE),
            observations_count: state.observationsCount,
            last_updated_on: computedOn,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (stateUpsertError) throw stateUpsertError;

      // Upsert the emitted-series row the Sprint-17 reader consumes. The 4
      // dead columns are intentionally left unset (R-08 drops them; writing
      // nothing to them is what makes R-07 order-free wrt R-08).
      const avgIntake = intakeDays > 0 ? intakeSum / intakeDays : 0;
      const { error: upsertError } = await supabase
        .from('tdee_estimates')
        .upsert(
          {
            user_id: profile.id,
            computed_on: computedOn,
            window_days: Math.max(1, daysAdvanced),
            avg_kcal_intake: round1(avgIntake),
            weight_delta_kg: round4(state.trendWeightKg - trendAtStart),
            estimated_tdee_kcal: round1(state.expenditureKcal),
            confidence: conf.band,
            is_warmup: conf.isWarmup,
          },
          { onConflict: 'user_id,computed_on' },
        );
      if (upsertError) throw upsertError;

      results.push({
        user_id: profile.id,
        status: 'ok',
        estimated_tdee_kcal: round1(state.expenditureKcal),
        confidence: conf.band,
        is_warmup: conf.isWarmup,
        days_advanced: daysAdvanced,
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
    JSON.stringify({ computed_on: computedOn, model: 'adaptive-kalman', results }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

function emitConfidence(state: TdeeState): { confidence: string; is_warmup: boolean } {
  const c = confidenceFromState(state);
  return { confidence: c.band, is_warmup: c.isWarmup };
}
