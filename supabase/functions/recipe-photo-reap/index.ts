// recipe-photo-reap (R-36b task 5)
//
// Cron: 0 5 * * 0 UTC (Sun ≈ 06:00 CET / 07:00 CEST) — weekly, off-peak,
// before the Monday `weekly-rollover` run so the two never overlap.
// STAGED: deploy this function BEFORE applying the cron migration
// (supabase/migrations/20260720120100_r36b_recipe_photo_reap_cron.sql) — an
// early firing is a silent no-op, not a visible failure, because pg_net's POST
// is asynchronous. Both are user-gated ops steps; see that migration's header.
//
// WHAT THIS DOES, EXACTLY: it deletes the object pair under any
// `<recipe_id>/` prefix that has NO matching row in `public.recipes`. That is
// the whole rule. Read literally, and stated up front because it is narrower
// than "reaps orphaned recipe photos" suggests.
//
// WHAT IT THEREFORE DOES NOT COVER. Every half-failure `photoStorage.ts` can
// produce leaves the `recipes` row in place — an upload that landed while the
// `photo_url` update failed, a clear whose removes landed while the null
// failed. None of those are visible to this rule, and they are deliberately
// not made visible to it: "the row exists but its `photo_url` doesn't point
// here" is indistinguishable, from the outside, from an upload that is
// committed in Storage and about to commit in Postgres a few hundred
// milliseconds later. A service-role job running unattended once a week
// cannot tell those apart, and getting it wrong deletes a live user photo.
// Those half-failures are handled where they happen instead: the keys are
// stable, so retrying a set overwrites the debris and retrying a clear removes
// it, and a dangling `photo_url` degrades to the placeholder in the UI. The
// worst case is one ≤2 MB object pair per abandoned attempt, on a bucket with
// one photo per recipe.
//
// SO WHAT IS IT FOR? It is the tripwire for the assumption everything above
// rests on: recipes are NEVER hard-deleted. Hiding a recipe only removes the
// caller's `user_recipe_refs` row; account deletion reassigns owned recipes to
// the anon sentinel user (`reconcile_account_delete`) and keeps the `recipes`
// row intact. So today "no matching `recipes` row" can only mean a prefix
// whose recipe never existed or vanished by some path we do not have — and a
// healthy week reaps ZERO prefixes, which is the expected, correct result. If
// a future feature introduces a real hard-delete of `recipes`, this function
// starts doing real work automatically (reaping the deleted recipes' photos,
// which is the right cleanup) — and the reaped counts in its logs are the
// signal that the assumption has changed and this comment trail, the bucket
// migration's, and `operations.md` all need revisiting together.
//
// It only removes the two keys it knows about (`full.webp` + `thumb.webp`).
// Any other object under a reaped prefix survives and is unreachable by any
// code path; nothing writes such an object today, and a blind "delete
// everything under this prefix" is not a power this job should have.
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
    // Unreachable per the supabase-js contract (no error ⇒ data), but this job
    // deletes user data with the service role and nobody watching: "the bucket
    // looks empty" is exactly the shape of a delete-everything bug, so it is an
    // explicit failure rather than a silently short listing.
    if (!data) throw new Error('storage list returned no data and no error');
    for (const entry of data) {
      if (UUID_RE.test(entry.name)) ids.add(entry.name);
    }
    if (data.length < PAGE_SIZE) break;
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
    // Same reasoning as the listing above, and worse here: a null read as "no
    // rows" would mark every prefix in the batch as debris and delete it.
    if (!data) throw new Error('recipes lookup returned no data and no error');
    for (const row of data) found.add((row as { id: string }).id);
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
