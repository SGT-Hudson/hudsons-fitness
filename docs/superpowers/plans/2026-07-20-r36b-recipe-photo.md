# R-36b — one photo per recipe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recipe can carry one cover photo. It is resized and re-encoded to WebP **on the client** (thumbnail + full), stored in a new **public** Supabase Storage bucket keyed by `recipe_id`, written only by the recipe's real creator, and cleaned up so orphans never accumulate. This is the app's **first use of Supabase Storage**.

**Spec:** `docs/superpowers/specs/2026-07-20-r36b-recipe-photo-design.md` (read it first — the decisions and the mobile gotchas are there).

## The four open questions, now decided (were carried from the spec)

1. **Reuse `recipes.photo_url`**, do not add a column. It is dead and null everywhere today. It stores the **object path** (`<recipe_id>/full.webp`), not a URL, with a comment naming the mismatch. Renaming a dead column for cosmetics is churn.
2. **Dedicated async upload action**, not folded into `save_recipe`. Upload is slow and async and wants its own progress/error state; blobs do not belong in a DB RPC. Setting `photo_url` is a single-table update done client-side after the upload resolves — invariant 3 permits it (only >1-table atomic mutations need an RPC).
3. **Lightbox for the full view**, reusing the existing shadcn `dialog.tsx` / `ResponsiveDialog`. No new route.
4. **Cron reconciler is an edge function** using the storage admin API with the service role, invoked by `cron.schedule` → `private.invoke_edge_function` (the established pattern). Raw SQL `delete from storage.objects` is unsafe — it may not reclaim the backing object.

## Architecture

Client resizes → uploads two WebP blobs to `recipe-photos/<recipe_id>/{full,thumb}.webp` → updates `recipes.photo_url`. Reads render `<img>` off the public URL + `?v=<updated_at>` (CDN cache-bust; `updated_at` bumps on save). Stable paths mean re-upload overwrites — no orphan on replace. A weekly edge-function sweep removes debris from partial failures. Real-creator RLS on `storage.objects` mirrors `recipe_ingredients`.

## Tech Stack

Supabase Storage (new), Postgres 17 + Supabase CLI, pgTAP for storage RLS, Deno edge function for the reaper, React 18 + Vite + TS, vitest (Tier-1/2), the existing `save_recipe`/media components. Migrations `supabase/migrations/`, tests `supabase/tests/*.test.sql`, functions `supabase/functions/`.

## Global Constraints

- **Worktree:** `/home/hudson/dev/hudsons-fitness/.claude/worktrees/r36b-recipe-photo`, branch `claude/r36b-recipe-photo`. Never push to `develop`/`main`.
- **No AI/Claude attribution anywhere.** Plain conventional commits.
- Commands run as `corepack pnpm …` (bare `pnpm` crashes on Node 20).
- **RLS is the sole security boundary and this repo is public.** The storage policies in Task 1 are a security boundary, not a nicety — Task 1 proves each one bites via pgTAP.
- Migration filename convention `YYYYMMDDHHMMSS_<slug>.sql`; newest existing is `20260719120000`. Use `20260720…`.
- Migration header house style: `-- <ID> — <one-line>.`, then `--`, then why-prose; lowercase SQL.
- pgTAP files use `no_plan()` … `finish()` — no count to keep in sync. CI `db-test` runs bare `supabase test db`; a file not named `*.test.sql` is silently skipped.
- Edge deploy needs both `--use-api` and `--import-map supabase/functions/deno.json` (see [[edge-deploy-command]]).
- **Deploy to live is a user-gated, outward-facing step** — the bucket + cron land on the live project only on Gonzalo's explicit go, same as any migration deploy.

## Ground truth (measured, do not re-derive)

- `recipes.photo_url text null` exists (`database.ts:923`), written by nothing — `save_recipe` (8-arg, `20260718100100`) never touches it.
- `RecipeMediaPlaceholder` (`src/features/recipes/components/`) fills all three media slots by `variant`: `RecipeCard.tsx:45` (`card`), `RecipeRow.tsx:46` (`thumbnail`), `RecetaDetailPage.tsx:278` (`hero`). Each takes `recipeId`. These are the swap points: photo when present, placeholder when not.
- `canEditRecipe(recipe, userId)` at `ownership.ts:19` — the real-creator gate; reuse it for the editor affordance.
- shadcn `dialog.tsx` and `ResponsiveDialog.tsx` exist — the lightbox uses one, no new dep.
- Edge functions live in `supabase/functions/` with a `_shared/` dir and `deno.json`; cron pattern is `cron.schedule(name, sched, $cron$ select private.invoke_edge_function('<fn>'); $cron$)` (`20260514120000`).
- `config.toml` has **no `[storage]` section**. Tier-3 pgTAP tests `storage.objects` policies in pure Postgres (the `storage` schema exists without the storage API running), so the RLS tests need no config change. Only real uploads need the storage service — those are verified against the live project in the browser pass, not in CI.
- **Account deletion does not orphan photos:** `reconcile_account_delete` reassigns recipes to the anon sentinel (keeps the row), so `<recipe_id>/` stays valid. No change to `delete-account`.

---

### Task 1: Storage bucket + real-creator RLS (security first)

**Files:**
- Create: `supabase/migrations/20260720120000_r36b_recipe_photos_bucket.sql`
- Create or extend: `supabase/tests/09_recipe_photos.test.sql`

**Step 1 — the migration.**
- [ ] `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('recipe-photos','recipe-photos', true, 2097152, array['image/webp']) on conflict (id) do nothing;` — 2 MB cap, WebP-only (the client always uploads WebP; anything else is a bug or abuse and the bucket rejects it).
- [ ] Policies on `storage.objects`, scoped `bucket_id = 'recipe-photos'`:
  - **INSERT / UPDATE / DELETE** gated on the real creator, joining the path's first folder to the recipe:
    `exists (select 1 from public.recipes r where r.id = ((storage.foldername(name))[1])::uuid and r.created_by_user_id = auth.uid() and r.created_by_user_id is not null and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0')`. UPDATE carries both `using` and `with check` with that expression (invariant, per the R-22 sweep).
  - **SELECT:** confirm whether a public bucket needs an explicit `select` policy for API `list`, or whether public-URL rendering (the only read path the app uses) bypasses `storage.objects` RLS. Rendering is `<img src=publicUrl>` → served by the CDN, no RLS. Add a `select` policy only if a real read path needs `list`; otherwise omit and say why in the header.
- [ ] Header prose: this is the first Storage use; explain the public-bucket + unguessable-`recipe_id`-path model and why signing URLs was rejected (pool content, all holders read it anyway).

**Step 2 — pgTAP, each policy proven to bite.** Follow the mutation-proof discipline ([[prove-assertions-bite-by-mutation]]): an assertion that passes against deliberately-broken RLS is worthless.
- [ ] The bucket exists, is `public`, has the 2 MB limit and the WebP-only mime list.
- [ ] As a non-creator (`set local role authenticated` + a different `auth.uid()`), INSERT/UPDATE/DELETE at `<someone-elses-recipe-id>/full.webp` is **denied**.
- [ ] As the anon sentinel owner, a write is **denied** (the `<> a0a0` clause).
- [ ] As the real creator, a write to their own `<recipe_id>/full.webp` is **allowed**.
- [ ] Prove each bite: strip the real-creator `exists(...)` from one policy, watch the corresponding "denied" test flip to allowed, revert. A test that stays green against `using (true)` is decorative.
- [ ] Run `corepack supabase test db` (Tier-3) green locally before moving on.

### Task 2: Client resize → WebP (Tier-1, pure-ish)

**Files:**
- Create: `src/features/recipes/photoResize.ts`
- Create: `src/features/recipes/photoResize.test.ts`

**Step 1 — the function.** `resizeToWebp(file: File): Promise<{ full: Blob; thumb: Blob }>`.
- [ ] Plain `<canvas>` + `canvas.toBlob(cb, 'image/webp', q)` from a loaded `<img>` (object URL). Zero deps. Full = 1600 px long edge q≈0.82; thumb = 400 px long edge q≈0.7. Preserve aspect ratio; never upscale (a smaller source stays its size).
- [ ] A non-decodable input (the `<img>` `onerror` fires, e.g. raw HEIC) **rejects with a typed error**, never resolves with a blank blob. This is the HEIC path from the spec.
- [ ] `q` values are constants at the top with a comment: starting points, tune by eye in the browser pass.

**Step 2 — tests** (jsdom has no real canvas encoder, so mock the canvas/image boundary and assert the orchestration, not pixel output):
- [ ] Produces two blobs, both `type === 'image/webp'`.
- [ ] Target dimensions honour the long-edge caps and aspect ratio (assert the width/height passed to `drawImage`/canvas sizing).
- [ ] A source smaller than the caps is not upscaled.
- [ ] `onerror` on the image → the promise rejects with the typed error; nothing resolves.
- [ ] Prove the error assertion bites: make the reject a resolve-with-empty, watch the test fail, revert.
- [ ] Note in the test file header: pixel fidelity and real WebP encoding are **not** covered here — that is the browser pass in Task 4.

### Task 3: Upload / clear API + hook

**Files:**
- Modify: `src/features/recipes/api.ts`, `src/features/recipes/hooks.ts`
- Create: `src/features/recipes/photoStorage.ts` (+ test)

- [ ] `setRecipePhoto(recipeId, file)`: `resizeToWebp` → `storage.from('recipe-photos').upload('<recipe_id>/full.webp', full, { upsert: true, contentType: 'image/webp' })` and the same for `thumb` → then `update recipes set photo_url = '<recipe_id>/full.webp'` (single-table; RLS restricts to the creator). Upsert = overwrite = no orphan on replace.
- [ ] `clearRecipePhoto(recipeId)`: `storage.remove` both keys, then `update … set photo_url = null`. Order: remove objects first, then null the column, so a failure leaves `photo_url` pointing at a gone object (self-heals on next reconcile) rather than a live object with no pointer (a real orphan).
- [ ] `publicPhotoUrl(recipe)`: derive from `photo_url` via `getPublicUrl` + `?v=${updated_at}`; thumb by swapping `full`→`thumb`. Returns null when `photo_url` is null.
- [ ] `useSetRecipePhoto` / `useClearRecipePhoto` mutations, invalidating `['recipes', ...]` so the card/detail refetch. `onError: toastError`.
- [ ] Tests mock the supabase storage client; assert upload keys, `upsert: true`, the `photo_url` write, and the remove-before-null ordering.

### Task 4: Editor + detail UI

**Files:**
- Modify: `RecetaDetailPage.tsx`, the editor media area (`RecipeEditorForm.tsx` / `RecetaEditorPage.tsx`), and the three media slots so a photo renders when present.
- Create: a `RecipePhoto` render component + a lightbox wrapper; extend/keep `RecipeMediaPlaceholder` for the no-photo case.

- [ ] Render: when `publicPhotoUrl(recipe)` is non-null, show the photo (thumb in card/row, full-ish in hero); else the placeholder. Keep the placeholder for every empty case.
- [ ] Detail: tapping the photo opens a **lightbox** (shadcn dialog / ResponsiveDialog) showing the 1600 px full version. No route.
- [ ] Editor: add / replace / remove control on the media area, gated by `canEditRecipe(recipe, user?.id)` — a holder of someone else's recipe sees the photo, no controls. States: empty (placeholder + add), uploading (progress/spinner), present (replace / remove). `<input type="file" accept="image/*">` so iOS hands back a converted JPEG.
- [ ] i18n: new `recetas` keys (add photo / replace / remove / uploading / unsupported-format error) in **both** `src/i18n/es` and `src/i18n/en`.
- [ ] Tier-2 tests: photo renders when `photo_url` set; placeholder when null; non-creator sees no controls; the unsupported-format error surfaces (mock `resizeToWebp` rejecting). Prove the non-creator gate bites.

### Task 5: Cron reconciler (debris backstop)

**Files:**
- Create: `supabase/functions/recipe-photo-reap/index.ts`
- Create: `supabase/migrations/20260720120100_r36b_recipe_photo_reap_cron.sql`

- [ ] Edge function (service-role client): list `recipe-photos` objects, collect their `<recipe_id>` prefixes, and `storage.remove` any prefix with no matching `recipes` row. Idempotent, batch-safe. Mirror the structure of an existing function in `supabase/functions/`; reuse `_shared`.
- [ ] Migration: `cron.schedule('recipe-photo-reap', '<weekly off-peak>', $cron$ select private.invoke_edge_function('recipe-photo-reap'); $cron$)`. Match the cadence style of the existing jobs.
- [ ] Deploy is an ops step (Task 7), gated on Gonzalo. Note in the header that the schedule is inert until the function is deployed.
- [ ] The function's design assumes recipes are never hard-deleted (so its prey is only partial-failure debris + abandoned pre-save uploads) — state that assumption in a comment so a future hard-delete feature revisits it.

### Task 6: Docs write-back

**Files:** `docs/data-model.md`, `docs/operations.md`, `docs/features.md`, `docs/roadmap.md`, `docs/changelog.md`.

- [ ] `data-model.md`: the `recipe-photos` bucket, its RLS, and `photo_url`'s new meaning (object path, not URL). This is the first Storage entry — give it a short home.
- [ ] `operations.md`: first Storage use; the reaper cron + its deploy step; the bucket config (public, 2 MB, WebP-only).
- [ ] `features.md`: recipes now carry a cover photo (client-resized, tap-to-enlarge). Fold into the Recipes section.
- [ ] `roadmap.md`: R-36b → shipped (note per-step photos were dropped).
- [ ] `changelog.md`: an entry + PR-table row on merge.

### Task 7: Verify + deploy

- [ ] `corepack pnpm test` (full, ~11-15 min), `pnpm lint`, `pnpm typecheck`, `corepack supabase test db` — all green.
- [ ] **Real-browser pass (mandatory — jsdom sees none of this):** on the QA user against live (dev points at prod — its data is disposable), upload a **real portrait phone photo**; confirm it comes out **upright** (EXIF), the thumbnail shows in the list, the lightbox opens the full version, a **replace** shows the new image immediately (cache-bust works, not the stale CDN copy), remove clears it, and the placeholder↔photo swap looks right in **both themes at mobile width**. Also try a non-`image/*`/HEIC-from-Files path and confirm the honest error, not a blank canvas.
- [ ] **Gonzalo-gated live deploy:** apply the two migrations to the live project and `supabase functions deploy recipe-photo-reap` (with `--use-api --import-map`). Verify the bucket exists and one reaper run is a no-op on a clean bucket. Do not deploy without an explicit go.

## Out of scope

Per the spec: per-step photos, storing the camera original, a gallery/multiple photos, a "fotos de los pasos" setting.
