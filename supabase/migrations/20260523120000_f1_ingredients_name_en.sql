-- F-1 step 1/2 — additive bilingual name column on the shared ingredient
-- library. Mirrors the exercises (R-19) pattern: `name` stays the ES-primary,
-- `name_en` is an optional secondary used for locale display fallback + search.
-- Purely additive: existing OFF/manual rows leave name_en null and behave
-- exactly as before. STAGED — applied to prod at a checkpoint, then types regen.

alter table public.ingredients
  add column if not exists name_en text null;

create index if not exists idx_ingredients_name_en_trgm
  on public.ingredients using gin (name_en extensions.gin_trgm_ops)
  where name_en is not null;
