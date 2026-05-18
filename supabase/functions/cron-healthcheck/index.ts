// cron-healthcheck (R-18 / D-F5)
//
// Cron: 0 6 * * * UTC (≈ 07:00 CET / 08:00 CEST). Runs AFTER all three data
// crons (snapshot 01:00, weekly-rollover 02:00 Mon, recalculate-tdee 03:00
// UTC), invoked by pg_cron via the SAME private.invoke_edge_function + Vault
// `cron_service_role_key` path the other jobs use (no new secret — see
// supabase/migrations/<staged>_r18_cron_healthcheck.sql, applied at Wave-3).
//
// Liveness check (D-F5): the failure mode is a SILENT under-run — a missing/
// stale Vault secret, or pg_cron skipping a job because the previous run
// overran. Both leave the data crons not writing while nothing surfaces it
// (and the daily snapshot is also the free-tier keep-alive, so a silent death
// is double-impact). This function detects that by reading the freshest
// `daily_nutrition_history.logged_on` and `tdee_estimates.computed_on` and
// applying the shared pure freshness predicate. If `daily_nutrition_history`
// is stale-or-empty it ALERTS.
//
// Alert channel (dependency-light, no new secret/webhook — per D-F5 / R-18):
//  1. `console.error` a single structured `CRON_LIVENESS_ALERT …` line — this
//     lands in the Edge function logs and is the matchable signal for any
//     future log-drain alert without adding a dependency now.
//  2. Return HTTP 503 on alert. Because pg_cron invokes this via
//     `net.http_post`, a 503 makes the failed run visible in
//     `cron.job_run_details` (the exact place operations.md's "how to tell
//     crons are dead" manual check looks), turning a silent under-run into a
//     loud, queryable one. A healthy run returns 200.
//
// The freshness math is the single shared pure core (R-17 pattern):
// `src/core/liveness.ts` (deterministic Vitest cover) + `todayInTZ()` from
// `src/core/dates.ts` (Europe/Madrid, the same TZ the snapshot job keys on —
// D-F4). No math is duplicated here; this file is only the I/O adapter.

// Version pinned once in supabase/functions/deno.json (D-F3 / R-17).
import { createClient } from '@supabase/supabase-js';
import { todayInTZ } from '../_shared/macros.ts';
import {
  evaluateFreshness,
  decideAlert,
  type FreshnessInput,
} from '../../../src/core/liveness.ts';

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'missing_env' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Europe/Madrid "today" — the same day boundary the snapshot job keys on
  // (D-F4); using the host/UTC clock here could be a day off near midnight.
  const todayISO = todayInTZ();

  async function latest(
    table: 'daily_nutrition_history' | 'tdee_estimates',
    column: 'logged_on' | 'computed_on',
  ): Promise<string | null> {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .order(column, { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    const row = data as Record<string, string | null> | null;
    return row ? (row[column] ?? null) : null;
  }

  try {
    const [dailyLatest, tdeeLatest] = await Promise.all([
      latest('daily_nutrition_history', 'logged_on'),
      latest('tdee_estimates', 'computed_on'),
    ]);

    const inputs: FreshnessInput[] = [
      { table: 'daily_history', latestISO: dailyLatest, todayISO },
      { table: 'tdee_estimates', latestISO: tdeeLatest, todayISO },
    ];
    const decision = decideAlert(inputs.map(evaluateFreshness));

    const payload = {
      today: todayISO,
      alert: decision.alert,
      message: decision.message,
      results: decision.results,
    };

    if (decision.alert) {
      // Single structured line — the matchable log-drain signal.
      console.error(`CRON_LIVENESS_ALERT ${JSON.stringify(payload)}`);
      // 503 so the failed run is visible in cron.job_run_details.
      return new Response(JSON.stringify(payload), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`cron-healthcheck OK ${decision.message}`);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A query error is itself a liveness failure — alert on it.
    console.error(`CRON_LIVENESS_ALERT {"error":${JSON.stringify(msg)}}`);
    return new Response(JSON.stringify({ alert: true, error: msg }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
