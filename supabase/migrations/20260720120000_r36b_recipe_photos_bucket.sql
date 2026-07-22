-- R-36b — the `recipe-photos` bucket and its real-creator write RLS.
--
-- The app's first use of Supabase Storage. One cover photo per recipe, keyed
-- `<recipe_id>/full.webp` and `<recipe_id>/thumb.webp` — stable keys, so a
-- replace overwrites in place and the app cache-busts on `recipes.updated_at`,
-- which `setRecipePhoto` bumps in the same statement that writes `photo_url`.
--
-- Why a PUBLIC bucket. A recipe is pooled content (R-01): every authenticated
-- user can already read every recipe row, so the photo is readable by every
-- holder anyway. Signed URLs would add expiry handling and defeat CDN caching
-- to protect nothing. The residual exposure is that the object is reachable by
-- anyone who knows the URL — and the URL contains the recipe's `gen_random_uuid()`
-- id, which is the "unguessable enough" a public bucket relies on. Cooking
-- photos at this sensitivity level are an accepted internet-public risk.
--
-- Why a PERMISSIVE SELECT policy. Postgres applies SELECT policies to any
-- statement that must READ the existing row, which includes `update`, `delete`
-- and `insert … on conflict do update` — exactly the two calls the app makes
-- (`storage.upload` with `upsert: true`, and `storage.remove`). Without a
-- select policy the conflicting/target row is invisible, so a replace cannot
-- overwrite and a remove silently matches zero rows while still reporting
-- success — the object survives with nothing pointing at it. So the write-side
-- policies below are only reachable at all if `select` is granted first.
--
-- Granting it permissively (every authenticated user, whole bucket) is
-- deliberate and costs nothing: the bucket is already world-readable over the
-- CDN, so `select` on `storage.objects` exposes only the metadata of objects
-- anyone can already fetch — path, size, mime, timestamps — and every path is
-- `<recipe_id>/…` for a recipe every authenticated user can already read from
-- `public.recipes`. The alternative (mirroring the real-creator join on the
-- read side) would join `public.recipes` on every listed row to hide nothing,
-- and would still have to be permissive enough for upsert/remove to see their
-- own target. Enumeration of object metadata is the whole delta, and it is
-- information the row-level pool already gives away.
--
-- Bucket-level guards: 2 MB cap and WebP-only. The client resizes and re-encodes
-- to WebP before every upload, so anything else arriving here is a bug or abuse
-- and the bucket rejects it rather than storing it.
--
-- Writes are gated on the recipe's REAL creator — the same predicate shape
-- `recipe_ingredients` / `recipe_steps` use: the path's first folder is joined
-- back to `public.recipes`, system seeds (NULL creator) and creator-hidden rows
-- (the `LIBRARY_ANON_OWNER_ID` sentinel) match no policy and are therefore
-- immutable. Per the R-22 invariant the UPDATE policy carries both `using` and
-- `with check`, the two expressions identical, so a path can neither be written
-- nor be re-pointed into someone else's recipe.
--
-- The object path is spelled `storage.objects.name`, fully qualified, and it
-- MUST stay that way: the reference sits inside `exists (select 1 from
-- public.recipes r …)`, and `recipes` has a `name` column of its own, so a bare
-- `name` binds to the INNER scope — the recipe's title, not the object's path.
-- That mistake does not fail loudly: `foldername('Ensalada de pollo')[1]` is not
-- a uuid, the `case` yields NULL, and every write is denied. Fail-closed, so the
-- app is merely broken rather than insecure, but the deny-side tests all pass
-- for the wrong reason. Tier-3 catches it via the positive "the real creator
-- CAN write" assertions.
--
-- The first folder is cast to `uuid` through a `case` guard rather than
-- directly: a bare `::uuid` on a non-uuid segment RAISES `22P02` instead of
-- denying, which turns a malformed path into a database error rather than a
-- clean permission denial. `case` is the one construct whose branch evaluation
-- order Postgres guarantees, so the cast is only ever reached for a segment
-- that already matched the uuid shape; anything else yields NULL, `r.id = null`
-- matches no row, and the write is denied.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

create policy "Anyone signed in reads recipe photo objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'recipe-photos');

create policy "Real creator uploads recipe photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and exists (
      select 1 from public.recipes r
      where r.id = case
          when (storage.foldername(storage.objects.name))[1] ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then ((storage.foldername(storage.objects.name))[1])::uuid
        end
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  );

create policy "Real creator updates recipe photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and exists (
      select 1 from public.recipes r
      where r.id = case
          when (storage.foldername(storage.objects.name))[1] ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then ((storage.foldername(storage.objects.name))[1])::uuid
        end
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  )
  with check (
    bucket_id = 'recipe-photos'
    and exists (
      select 1 from public.recipes r
      where r.id = case
          when (storage.foldername(storage.objects.name))[1] ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then ((storage.foldername(storage.objects.name))[1])::uuid
        end
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  );

create policy "Real creator deletes recipe photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and exists (
      select 1 from public.recipes r
      where r.id = case
          when (storage.foldername(storage.objects.name))[1] ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then ((storage.foldername(storage.objects.name))[1])::uuid
        end
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  );
