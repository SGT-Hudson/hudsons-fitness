// recipe-photo-reap (R-36b task 5)
//
// Cron: 0 5 * * 0 UTC (Sun ≈ 06:00 CET / 07:00 CEST) — weekly, off-peak,
// before the Monday `weekly-rollover` run so the two never overlap.
// STAGED: this schedule is inert until the function itself is deployed
// (a separate, user-gated ops step — see supabase/migrations/
// 20260720120100_r36b_recipe_photo_reap_cron.sql).
//
// Backstop for the `recipe-photos` bucket (photoStorage.ts, task 3). Stable
// keys `<recipe_id>/full.webp` + `<recipe_id>/thumb.webp` with `upsert: true`
// mean a normal photo replace overwrites in place — nothing is ever orphaned
// by the happy path, so a healthy run finds ZERO prefixes to reap. What this
// prunes is debris from the unhappy paths: `setRecipePhoto` uploading
// successfully but the recipe never being saved (an abandoned pre-save
// upload flow, should one ever exist upstream of this function — today's
// editor only shows the photo field for an already-saved recipe, so this is
// currently a defensive no-op path, not an active one), or an upload
// succeeding while a *sibling* write in the same client call fails partway
// (partial-failure debris).
//
// ASSUMPTION THIS DESIGN RELIES ON: recipes are NEVER hard-deleted. Hiding a
// recipe only removes the caller's `user_recipe_refs` row; account deletion
// reassigns owned recipes to the anon sentinel user (`reconcile_account_delete`)
// and keeps the `recipes` row intact. So "no matching `recipes` row for this
// prefix" can ONLY mean debris, never "the recipe was deleted" — the reaper
// does not need to special-case a live recipe's photo. If a future feature
// introduces a real hard-delete of `recipes`, THIS FUNCTION MUST BE REVISITED:
// as written it would then also reap the photos of legitimately deleted
// recipes, which happens to be correct cleanup in that case too, but the
// "never hard-deleted" comment trail (here and in the bucket migration)
// would go stale and should be updated together.
//
// Deletion goes through the storage admin API (`storage.remove`), never raw
// `delete from storage.objects` SQL — the latter can leave the backing
// object un-reclaimed, which is exactly the kind of debris this function
// exists to clean up, not create. That is also why this is an edge function
// and not a SQL cron body.
//
// Idempotent + batch-safe: re-running finds nothing once debris is cleared
// (upsert-per-run, no state carried between runs), and both the existence
// check and the delete are chunked so an arbitrarily large bucket or `recipes`
// table never builds one unbounded request.

// Version pinned once in supabase/functions/deno.json (D-F3 / R-17).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'recipe-photos';
// Storage `list()` and Postgres `.in()` both tolerate far more than this, but
// chunking keeps every single request small and predictable regardless of
// how large the bucket or the `recipes` table grows.
const PAGE_SIZE = 1000;
// Kept well below PostgREST's GET query-string budget: a `.in('id', …)`
// filter serializes every uuid into the URL, and 100 × 36-char uuids stays
// comfortably inside typical gateway header limits.
const CHUNK_SIZE = 100;
// A recipe id is always a uuid (the bucket's own write RLS enforces this
// shape via `((storage.foldername(name))[1])::uuid`) — used to defensively
// skip any stray top-level object that isn't one of our `<recipe_id>/...`
// folders, rather than letting an unrelated object crash or get swept up.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Every top-level "folder" name in the bucket, i.e. every `<recipe_id>` prefix that currently has at least one object under it. Paginated — a bucket can outgrow one page. */
async function listRecipeIdPrefixes(supabase: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    for (const entry of data ?? []) {
      if (UUID_RE.test(entry.name)) ids.add(entry.name);
    }
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return [...ids];
}

/** Recipe ids (from `candidateIds`) that still have a matching `recipes` row — i.e. are NOT debris. Chunked `.in()` lookups. */
async function existingRecipeIds(
  supabase: SupabaseClient,
  candidateIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of chunk(candidateIds, CHUNK_SIZE)) {
    const { data, error } = await supabase.from('recipes').select('id').in('id', batch);
    if (error) throw error;
    for (const row of data ?? []) found.add((row as { id: string }).id);
  }
  return found;
}

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

  try {
    const prefixes = await listRecipeIdPrefixes(supabase);
    const live = await existingRecipeIds(supabase, prefixes);
    const orphanIds = prefixes.filter((id) => !live.has(id));

    const reaped: string[] = [];
    const failed: Array<{ recipe_id: string; error: string }> = [];

    for (const batch of chunk(orphanIds, CHUNK_SIZE)) {
      const paths = batch.flatMap((id) => [`${id}/full.webp`, `${id}/thumb.webp`]);
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) {
        // A failed remove must not be counted as reaped — leave those ids for
        // next week's run to retry rather than silently declaring them gone.
        for (const id of batch) failed.push({ recipe_id: id, error: error.message });
        continue;
      }
      reaped.push(...batch);
    }

    const payload = {
      checked: prefixes.length,
      reaped_count: reaped.length,
      reaped,
      failed,
    };

    if (failed.length > 0) {
      // Same pattern as cron-healthcheck: a structured log line plus a
      // non-200 status so a failed run is visible in cron.job_run_details
      // instead of silently reporting success.
      console.error(`RECIPE_PHOTO_REAP_FAILED ${JSON.stringify(payload)}`);
      return new Response(JSON.stringify(payload), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`recipe-photo-reap OK checked=${payload.checked} reaped=${payload.reaped_count}`);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`RECIPE_PHOTO_REAP_FAILED {"error":${JSON.stringify(msg)}}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
