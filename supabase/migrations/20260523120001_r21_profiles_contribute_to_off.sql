-- R-21 — OFF contribute-back: per-user opt-out for sharing scanned products.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in docs/superpowers/specs/2026-05-21-off-contribute-back-design.md §4.
-- Synced, DB-canonical preference (like profiles.language); default ON
-- (default-on-with-opt-out consent model). The client reads this flag and
-- skips the off-contribute call when false. NULL is disallowed so the gate
-- is unambiguous for every existing row.

alter table public.profiles
  add column if not exists contribute_to_off boolean not null default true;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   alter table public.profiles drop column if exists contribute_to_off;
