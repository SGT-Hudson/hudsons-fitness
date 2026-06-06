-- Project B catalog — dedupe secondary muscles against primary.
-- A muscle is the prime mover OR an assister for a given exercise, never both.
-- 32 rows carried a fine code in BOTH primary_muscles and secondary_muscles
-- (multi-code primary overrides intersecting the mapper-derived secondary, or two
-- coarse codes collapsing to one fine code), which double-counted in the muscle
-- heatmap (primary 1.0 + secondary 0.5). build-seed.ts now drops primary codes
-- from secondary at generation time (the regenerated 20260604120200 seed bakes
-- this in for fresh resets); this migration applies the same fix to envs where the
-- seed already ran. Order-preserving, idempotent, guarded on source.

update public.exercises
set secondary_muscles = (
  select coalesce(array_agg(c order by ord), array[]::text[])
  from unnest(secondary_muscles) with ordinality as u(c, ord)
  where c <> all (primary_muscles)
)
where source = 'free-exercise-db' and primary_muscles && secondary_muscles;
