-- R-36b — the `recipe-photos` bucket and its real-creator write RLS.
--
-- The app's first use of Supabase Storage. One cover photo per recipe, keyed
-- `<recipe_id>/full.webp` and `<recipe_id>/thumb.webp` — stable keys, so a
-- replace overwrites in place and the app cache-busts with `?v=<updated_at>`.
--
-- Why a PUBLIC bucket. A recipe is pooled content (R-01): every authenticated
-- user can already read every recipe row, so the photo is readable by every
-- holder anyway. Signed URLs would add expiry handling and defeat CDN caching
-- to protect nothing. The residual exposure is that the object is reachable by
-- anyone who knows the URL — and the URL contains the recipe's `gen_random_uuid()`
-- id, which is the "unguessable enough" a public bucket relies on. Cooking
-- photos at this sensitivity level are an accepted internet-public risk.
--
-- Why no SELECT policy on `storage.objects`. The only read path the app has is
-- `<img src=publicUrl>`, which the storage CDN serves from a public bucket
-- without ever consulting `storage.objects` RLS. Nothing in the app calls
-- `list()` — object keys are derived from `recipes.photo_url`, never
-- enumerated. Adding a permissive SELECT policy would therefore grant PostgREST
-- enumeration of every recipe's object metadata to buy no feature, so it is
-- deliberately omitted. If a future feature needs `list()`, that is the moment
-- to add one.
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

create policy "Real creator uploads recipe photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and exists (
      select 1 from public.recipes r
      where r.id = ((storage.foldername(name))[1])::uuid
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
      where r.id = ((storage.foldername(name))[1])::uuid
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  )
  with check (
    bucket_id = 'recipe-photos'
    and exists (
      select 1 from public.recipes r
      where r.id = ((storage.foldername(name))[1])::uuid
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
      where r.id = ((storage.foldername(name))[1])::uuid
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  );
