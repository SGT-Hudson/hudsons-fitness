-- R-01 / D-A2, D-A3, D-A4: ★ Library Contribution & Lifecycle Model, Phase 1.
-- Step 1/8 — Seed the reserved anon owner id.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- This stages the sentinel `auth.users` + `public.profiles` row that the ★
-- model uses as the "anonymized creator" owner of pooled
-- ingredients/recipes after a creator-hide. Specced in
-- `docs/superpowers/specs/2026-05-18-library-model-phase1-design.md` §4
-- and sequenced by
-- `docs/superpowers/plans/2026-05-18-library-model-phase1-plan.md`
-- (Task 1 of 12). It is intentionally NOT applied by its PR: the live
-- Supabase project is untouched. Applied by the operator at the Wave-3
-- prod-migration checkpoint alongside the rest of the R-01 staged set
-- (anon seed → ref tables → backfill → drop deleted_at → hide RPCs →
-- save_recipe ext + reconcile RPC → RLS rewrite) AFTER explicit user
-- sign-off on spec §13.
--
-- Do not run this against any database from CI or from this PR.
--
-- ── Distinctness invariant (spec §4) ───────────────────────────────────────
-- `created_by_user_id IS NULL`                        → immutable system seed
-- `created_by_user_id = LIBRARY_ANON_OWNER_ID`        → creator-hidden / anon
-- `created_by_user_id = <any other auth.users id>`    → owned by that user
--
-- The chosen sentinel `00000000-0000-0000-0000-00000000a0a0` is provably
-- NOT `gen_random_uuid()` output (RFC-4122 v4 UUIDs set specific version /
-- variant bits in positions our value leaves zero) and is visibly a
-- sentinel (all-zero prefix). It is also distinct from the nil UUID
-- `000…000` so it cannot collide with an "unset" value. Recorded as the
-- code constant `LIBRARY_ANON_OWNER_ID` in `src/core/library.ts` (single
-- source — the edge function imports the same literal via relative path).
--
-- ── Trigger interaction (handle_new_user) ──────────────────────────────────
-- `public.handle_new_user()` (R-00 baseline line 374, SECURITY DEFINER) is
-- a trigger that auto-creates a `profiles` row whenever a row lands in
-- `auth.users`. Our explicit `profiles` insert therefore races the trigger
-- — the trigger creates `(id, display_name = split_part(email,'@',1))`
-- with a NULL email here. We MUST `on conflict (id) do update` (not `do
-- nothing`) so our deliberate `'Biblioteca compartida'` / `language='es'`
-- values win over the trigger's defaults. Without that, the sentinel
-- profile would have a NULL `display_name`, which is harmless functionally
-- but loses the intent-documenting label.
--
-- ── Impl-time verification before Wave-3 apply ─────────────────────────────
-- The exact NOT-NULL columns on `auth.users` vary by Supabase / GoTrue
-- version. The set below (`id, instance_id, aud, role, created_at,
-- updated_at`) covers every documented requirement at the time of staging
-- but the operator MUST verify against the live `auth.users` schema before
-- applying — if a NOT-NULL column has been added in a Supabase update, the
-- insert needs to provide it. `on conflict (id) do nothing` on the
-- auth.users insert keeps a re-apply safe.

-- 1. The non-authenticatable sentinel auth user. No email, no identity row,
-- no password — it can never log in; it exists solely as an FK target and
-- an RLS sentinel.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-00000000a0a0',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  now(),
  now()
)
on conflict (id) do nothing;

-- 2. Matching profile row (handle_new_user trigger fires on step 1; we
-- explicitly override its defaults — see trigger-interaction note above).
-- The column list is intentionally minimal so it survives R-03's
-- `bone_kg` drop and R-14's `units` drop in either order (spec §11).
insert into public.profiles (
  id,
  display_name,
  language,
  start_date
)
values (
  '00000000-0000-0000-0000-00000000a0a0',
  'Biblioteca compartida',
  'es',
  current_date
)
on conflict (id) do update
set display_name = excluded.display_name,
    language     = excluded.language;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Only safe to roll back IFF no `ingredients` / `recipes` row has been
-- ownership-transferred to the sentinel (i.e. before any creator-hide has
-- fired in production). Once any pool item points at this user via
-- `created_by_user_id = LIBRARY_ANON_OWNER_ID`, deleting the auth.users
-- row would either FK-cascade-delete those items (data loss) or
-- FK-RESTRICT-fail. Keep the rollback simple by refusing to delete in that
-- case; the operator can ALWAYS leave the sentinel rows in place inertly.
--
-- ROLLBACK:
--   do $$
--   begin
--     if exists (
--       select 1 from public.ingredients
--       where created_by_user_id = '00000000-0000-0000-0000-00000000a0a0'
--       union all
--       select 1 from public.recipes
--       where created_by_user_id = '00000000-0000-0000-0000-00000000a0a0'
--     ) then
--       raise exception 'Cannot rollback: pool items already owned by anon sentinel; leave the sentinel rows in place.';
--     end if;
--     delete from public.profiles where id = '00000000-0000-0000-0000-00000000a0a0';
--     delete from auth.users where id = '00000000-0000-0000-0000-00000000a0a0';
--   end $$;
