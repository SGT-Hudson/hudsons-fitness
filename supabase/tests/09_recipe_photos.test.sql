-- Tier-3 / R-36b — the `recipe-photos` bucket and the real-creator RLS on
-- `storage.objects`. The bucket is public (read is served by the CDN, never by
-- `storage.objects` RLS) so only the write side is policed here: an object at
-- `<recipe_id>/…` may only be written by the recipe's REAL creator, with system
-- seeds (NULL creator) and the `LIBRARY_ANON_OWNER_ID` sentinel writable by
-- nobody — the same predicate shape as `recipe_ingredients` / `recipe_steps`.

begin;
select * from no_plan();

-- privileged seeds (before assuming the authenticated role)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com')
on conflict (id) do nothing;

insert into public.recipes (id, name, servings, created_by_user_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'A recipe', 2, '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-0000000000b1', 'B recipe', 2, '22222222-2222-2222-2222-222222222222'),
  -- sentinel-owned (LIBRARY_ANON_OWNER_ID, R-01): a creator-hidden pool recipe
  ('00000000-0000-0000-0000-0000000000c1', 'Anon recipe', 2, '00000000-0000-0000-0000-00000000a0a0')
on conflict (id) do nothing;

-- ── bucket shape ─────────────────────────────────────────────────────────────
select is(
  (select public from storage.buckets where id = 'recipe-photos'),
  true, 'the recipe-photos bucket exists and is public');

select is(
  (select file_size_limit from storage.buckets where id = 'recipe-photos'),
  2097152::bigint, 'the recipe-photos bucket caps objects at 2 MB');

select is(
  (select allowed_mime_types from storage.buckets where id = 'recipe-photos'),
  array['image/webp'], 'the recipe-photos bucket accepts WebP only');

-- ── act as B, a non-creator of A's recipe ────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$ insert into storage.objects (bucket_id, name, owner_id)
      values ('recipe-photos',
              '00000000-0000-0000-0000-0000000000b1/full.webp',
              '22222222-2222-2222-2222-222222222222') $q$,
  'B can INSERT a photo under its own recipe''s prefix');

select throws_ok(
  $q$ insert into storage.objects (bucket_id, name, owner_id)
      values ('recipe-photos',
              '00000000-0000-0000-0000-0000000000a1/full.webp',
              '22222222-2222-2222-2222-222222222222') $q$,
  '42501', NULL, 'B cannot INSERT a photo under A''s recipe prefix');

-- seed an object under A's prefix with privilege, so B has a real target to
-- attack for the UPDATE/DELETE cases below
reset role;
insert into storage.objects (bucket_id, name, owner_id)
  values ('recipe-photos',
          '00000000-0000-0000-0000-0000000000a1/full.webp',
          '11111111-1111-1111-1111-111111111111');
insert into storage.objects (bucket_id, name, owner_id)
  values ('recipe-photos',
          '00000000-0000-0000-0000-0000000000c1/full.webp',
          '00000000-0000-0000-0000-00000000a0a0');
set local role authenticated;

with u as (
  update storage.objects set metadata = '{"hijacked":true}'::jsonb
   where bucket_id = 'recipe-photos'
     and name = '00000000-0000-0000-0000-0000000000a1/full.webp'
   returning 1
)
select is(count(*)::int, 0, 'B cannot UPDATE a photo under A''s recipe prefix') from u;

select throws_ok(
  $q$ update storage.objects
         set name = '00000000-0000-0000-0000-0000000000a1/thumb.webp'
       where bucket_id = 'recipe-photos'
         and name = '00000000-0000-0000-0000-0000000000b1/full.webp' $q$,
  '42501', NULL, 'B cannot re-point its own photo into A''s recipe prefix');

with d as (
  delete from storage.objects
   where bucket_id = 'recipe-photos'
     and name = '00000000-0000-0000-0000-0000000000a1/full.webp'
   returning 1
)
select is(count(*)::int, 0, 'B''s DELETE against A''s photo removes nothing') from d;

-- ── the sentinel-owned recipe's prefix is writable by nobody ─────────────────
-- The interesting attacker is a session whose OWN auth.uid() equals the
-- sentinel: for it `r.created_by_user_id = auth.uid()` MATCHES, so the explicit
-- `<> '00000000-0000-0000-0000-00000000a0a0'` clause is the only thing left
-- blocking the write. A real login can never carry this `sub` (R-01), but the
-- anon seed's auth.users row makes the claim well-formed enough to evaluate.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a0a0","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$ insert into storage.objects (bucket_id, name, owner_id)
      values ('recipe-photos',
              '00000000-0000-0000-0000-0000000000c1/thumb.webp',
              '00000000-0000-0000-0000-00000000a0a0') $q$,
  '42501', NULL, 'the sentinel session cannot INSERT a photo under the sentinel-owned recipe');

with u as (
  update storage.objects set metadata = '{"hijacked":true}'::jsonb
   where bucket_id = 'recipe-photos'
     and name = '00000000-0000-0000-0000-0000000000c1/full.webp'
   returning 1
)
select is(count(*)::int, 0, 'the sentinel session cannot UPDATE the sentinel-owned recipe''s photo') from u;

with d as (
  delete from storage.objects
   where bucket_id = 'recipe-photos'
     and name = '00000000-0000-0000-0000-0000000000c1/full.webp'
   returning 1
)
select is(count(*)::int, 0, 'the sentinel session''s DELETE against the sentinel-owned recipe''s photo removes nothing') from d;

-- ── the real creator can write its own recipe's photo (act as A) ────────────
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$ insert into storage.objects (bucket_id, name, owner_id)
      values ('recipe-photos',
              '00000000-0000-0000-0000-0000000000a1/thumb.webp',
              '11111111-1111-1111-1111-111111111111') $q$,
  'A can INSERT a photo under its own recipe''s prefix');

with u as (
  update storage.objects set metadata = '{"replaced":true}'::jsonb
   where bucket_id = 'recipe-photos'
     and name = '00000000-0000-0000-0000-0000000000a1/full.webp'
   returning 1
)
select is(count(*)::int, 1, 'A can UPDATE its own recipe''s photo') from u;

with d as (
  delete from storage.objects
   where bucket_id = 'recipe-photos'
     and name = '00000000-0000-0000-0000-0000000000a1/full.webp'
   returning 1
)
select is(count(*)::int, 1, 'A can DELETE its own recipe''s photo') from d;

select * from finish();
rollback;
