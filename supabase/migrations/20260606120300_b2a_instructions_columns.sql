-- B2a step 1/3 — exercise instructions columns.
-- Adds two parallel, index-aligned text[] columns for bilingual step-by-step
-- instructions: instructions_es[i] translates instructions_en[i]; equal length
-- per exercise (enforced at build time in build-seed.ts, asserted in pgTAP).
-- Both default to empty '{}' so the source='system' rows (no source
-- instructions) and any future manual rows are valid without instructions.
-- Idempotent (add column if not exists). No BEGIN/COMMIT: Supabase wraps each
-- migration file in its own transaction.
alter table public.exercises
  add column if not exists instructions_en text[] not null default '{}',
  add column if not exists instructions_es text[] not null default '{}';

-- ROLLBACK:
-- alter table public.exercises
--   drop column if exists instructions_en,
--   drop column if exists instructions_es;
