-- Training MVP step 4/4 — RLS on `exercises` (post-R-01 verbatim).
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in
-- `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md` §4.1
-- ("RLS — copied from the post-R-01 `ingredients` policies verbatim").
-- Sequenced by
-- `docs/superpowers/plans/2026-05-20-training-mvp-plan.md` Task 4.
--
-- Structural copy of the post-R-01 ingredients policies — the
-- three-state owner semantics (NULL = system seed = immutable;
-- LIBRARY_ANON_OWNER_ID = anonymised = immutable, never re-owned;
-- real user = owned). Source of the policy text:
-- `supabase/migrations/20260520120070_r01_rls.sql` §2 (ingredients).
--
-- Runs LAST in the training set, after Tasks 1-3, so by this point the
-- table + the RPCs that consume it already exist.
--
-- Do not run this against any database from CI or from this PR.

alter table public.exercises enable row level security;

create policy "Exercises pool readable"
  on public.exercises for select
  to authenticated
  using (true);

create policy "Self-tagged insert into exercises pool"
  on public.exercises for insert
  to authenticated
  with check (auth.uid() = created_by_user_id);

create policy "Real owner updates own exercise"
  on public.exercises for update
  to authenticated
  using (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  )
  with check (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  );

create policy "Real owner deletes own exercise"
  on public.exercises for delete
  to authenticated
  using (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  );

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop policy if exists "Exercises pool readable"               on public.exercises;
--   drop policy if exists "Self-tagged insert into exercises pool" on public.exercises;
--   drop policy if exists "Real owner updates own exercise"        on public.exercises;
--   drop policy if exists "Real owner deletes own exercise"        on public.exercises;
--   alter table public.exercises disable row level security;
