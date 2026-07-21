# R-36b — one photo per recipe

**Date:** 2026-07-20
**Thread:** recipe photos (deferred from R-36; per-step photos dropped)
**Type:** new feature + first-ever Supabase Storage use + schema/RLS
**Brainstorm memory:** [[r36-recipe-steps-photos-notes]] (per-step model; superseded below)

## What changed from the deferred plan

R-36b was scoped as **per-step** photos. That is dropped. This ships **one photo
per recipe** — a cover image — which:

- needs no new table (the photo lives on the existing dead `recipes.photo_url`
  column), and
- is dramatically less storage/UX surface than a photo per step.

Per-step photos are not on the roadmap after this; if they ever return, they are
a separate epic built on the bucket this establishes.

## Decisions (converged with Gonzalo, 2026-07-20)

1. **Cost is not a decision input.** Verified 2026-07-20: at this app's scale
   (one user, hundreds of photos) every storage option is $0–$2/mo. The only
   three-figure line item on the board is Supabase image transformations
   ($5/1 000 origin images/mo, Pro-only) — avoided entirely by resizing on the
   client. Stay on **Supabase Storage** (same client, same JWT, RLS reuses
   `auth.uid()`; a second vendor saves ~$2/mo and costs an Edge Function + auth
   bridge — not worth it).

2. **Resize + re-encode on the client, always.** Two derivatives from one canvas
   pass, both WebP:
   - **thumbnail** — 400 px long edge, quality ~0.7, ≈ 20–40 KB. For the Recetas
     list/cards.
   - **full** — 1600 px long edge, quality ~0.82, ≈ 150–300 KB (content-
     dependent). For the open/zoom view.
   1600/0.82 is visually indistinguishable from the original on a phone (~1170
   physical px) while roughly halving the bytes of a 2000/0.85 version. **These
   numbers are a starting point — tune quality by eye against a real food photo
   in implementation, do not treat 0.82 as fixed.** "Lossless" was explicitly
   ruled out: a phone photo is already lossy from the camera, so lossless WebP
   would be *larger* than the original for zero visible gain.

3. **Public bucket, unguessable paths.** The photo sits on the pooled `recipes`
   row, so it is readable by every authenticated user who holds the recipe
   anyway — signing URLs would be ceremony that also breaks CDN caching and
   expires. Gonzalo accepts internet-public visibility for cooking photos.
   Paths are keyed by `recipe_id` (a UUID), which is the "hide it as well as
   possible" the public bucket needs.

4. **No orphan accumulation.** Recipe rows are **never deleted** (hide drops the
   ref row; account-delete reassigns to the anon sentinel), so there is no
   "recipe deleted" event to hook cleanup onto. Instead:
   - **Stable path + overwrite.** `<recipe_id>/full.webp` and
     `<recipe_id>/thumb.webp`. Replacing a photo overwrites in place — it never
     orphans. Removing a photo deletes those two known keys.
   - **Cron reconciler as a debris backstop**, not the primary mechanism. Its
     only prey is partial-failure debris (upload succeeded, DB write didn't) and
     abandoned pre-save uploads. Weekly. Satisfies "may sit a day, never
     accumulate."

## Design

### Storage layout

- Bucket `recipe-photos`, **public**, created in a migration (so CI's Tier-3
  pgTAP stack has it). Per-bucket limits: max size 2 MB, `allowed_mime_types =
  {image/webp}` — the client only ever uploads WebP, so a non-WebP upload is a
  bug or an attack and the bucket rejects it.
- Object keys: `<recipe_id>/full.webp`, `<recipe_id>/thumb.webp`. Stable, so
  re-upload overwrites.

### Cache-busting

- `recipes.photo_url` holds the **object path** (`<recipe_id>/full.webp`) when a
  photo exists, `null` otherwise. It is not a full URL — the app derives the
  public URL via `storage.from('recipe-photos').getPublicUrl(...)` and appends
  `?v=<updated_at>`. `updated_at` bumps on every recipe save, so the CDN cannot
  serve a stale image after a replace. The thumbnail path is derived by
  convention (swap `full`→`thumb`).
- **Open question for the plan:** whether reusing `photo_url` (rename-in-place of
  a dead column) is cleaner than a fresh `photo_path` column. Reuse keeps the
  migration to a comment + backfill-free (the column is null everywhere today);
  a rename states intent. Lean reuse; decide in the plan.

### Write path (upload)

- Setting the photo is a **client → Storage upload** of the two WebP blobs,
  followed by a **single-table update** of `recipes.photo_url`. Per invariant 3
  this needs no RPC (only >1-table atomic mutations do); the pool UPDATE RLS on
  `recipes` already restricts the write to the real creator.
- **Open question for the plan:** does the photo set/clear fold into the existing
  `save_recipe` flow (add `p_photo_url`, editor saves it with everything else),
  or is it a **dedicated async action** (upload → update, separate from the form
  submit)? Photo upload is inherently async and slow relative to a text save, so
  a dedicated action with its own progress/error state is likely cleaner. Decide
  in the plan against the editor UX below.

### Storage RLS (on `storage.objects`)

Storage policies are table RLS on `storage.objects`, gated by joining the path's
`recipe_id` back to `public.recipes`:

- **SELECT** — public bucket, so read is open (anon included). No policy needed
  beyond the bucket being public.
- **INSERT / UPDATE / DELETE** — only the recipe's real creator:
  `exists (select 1 from public.recipes r where r.id =
  (storage.foldername(name))[1]::uuid and r.created_by_user_id = auth.uid() and
  r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0')`. Same
  real-creator shape as `recipe_ingredients` / `recipe_steps`.

### Editor / detail UX

- **Detail page:** the recipe media area (`RecipeMediaPlaceholder`, hue-from-id
  today) shows the photo when present, the colour placeholder when not. Tapping
  the photo opens the full (1600 px) version — **open question:** a lightbox, or
  a route? Lean lightbox (no new route, matches an image-viewer expectation).
- **Editor:** an add / replace / remove control on the media area. States to
  cover: empty (placeholder + "add photo"), uploading (progress or spinner —
  jsdom cannot see this, real-browser check required), present (replace / remove).
- **Only the real creator** gets the add/replace/remove affordance — reuse
  `canEditRecipe(recipe, user?.id)` from `ownership.ts`. A holder of someone
  else's recipe sees the photo but no controls, exactly as with steps.

### Cron reconciler

- A new edge function (invoked by `cron.schedule` → `private.invoke_edge_function`,
  the established pattern) lists `recipe-photos` objects and deletes any whose
  `<recipe_id>` prefix has no matching `recipes` row.
- **Open question for the plan:** the delete mechanism. Deleting a
  `storage.objects` row via raw SQL may not reclaim the backing object; the
  storage admin API is the safe path — hence an edge function, not a pure SQL
  cron. Confirm in the plan.
- Weekly, off-peak, aligned with the existing cron jobs' cadence.

## Client resize — the mobile gotchas (from research, verified 2026-07-20)

- **Method:** plain `<canvas>` + `canvas.toBlob(blob, 'image/webp', q)` from an
  already-loaded `<img>`. Zero dependencies, zero bundle cost, works on every
  target including older Safari. `createImageBitmap`/`OffscreenCanvas` buys
  off-main-thread work that a single small photo does not need.
- **EXIF orientation** — phone photos carry rotation metadata. Modern browsers
  apply it to `<img>` by default, so drawing from a loaded `<img>` is usually
  upright, but this is the classic failure of the feature: **must be verified
  with a real portrait photo shot on a phone**, not assumed.
- **HEIC** — iPhones shoot HEIC. Picking via `<input type="file"
  accept="image/*">` makes iOS Safari hand back a converted JPEG, but a file
  chosen from the Files app can arrive as raw HEIC, which canvas cannot decode.
  Handle the decode failure with an honest error ("formato no soportado"), never
  a silent blank canvas.

## Testing

- Tier-1: the resize function produces a WebP blob at the target long-edge
  dimension for both derivatives; a non-decodable input surfaces an error rather
  than a blank blob.
- Tier-2: editor shows add when empty, replace/remove when present; a non-creator
  sees the photo but no controls (`canEditRecipe` gate).
- Tier-3 (pgTAP): the storage RLS policies exist and are real-creator-gated —
  the anon sentinel and a non-creator cannot write to `<recipe_id>/…`; the
  bucket is public-SELECT.
- Each load-bearing assertion proven to bite by reintroducing the defect (this
  repo has shipped green-but-vacuous tests before).
- **Real-browser pass is mandatory** and covers what jsdom cannot: a real
  portrait phone photo comes out upright, upload progress renders, the CDN serves
  the new image after a replace (cache-bust works), and the placeholder→photo
  swap looks right in both themes at mobile width.

## Out of scope

- Per-step photos (dropped; separate epic if ever revived).
- Storing the untouched camera original (10× the bytes for no visible gain on a
  phone; ruled out).
- A "Fotos de los pasos" setting (belonged to the per-step model).
- Multiple photos / a gallery per recipe. One cover photo only.

## Open questions carried to the plan

1. Reuse `photo_url` vs add `photo_path`.
2. Photo write folded into `save_recipe` vs a dedicated async upload action.
3. Full-view lightbox vs route.
4. Cron reconciler delete mechanism (storage admin API via edge — confirm).
