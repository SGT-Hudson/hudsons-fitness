-- Project B full-catalog review — resolve the 2 held-ambiguous rows.
-- The full-catalog pass (20260606120000) held 2 rows on a true 3-way lens split:
-- Push_Press_-_Behind_the_Neck and Vertical_Swing. Follow-up anatomical review
-- resolved both: the behind-the-neck push press is lateral-deltoid led (the
-- flared-elbow bar path maximizes the side delt; rear delt + traps only
-- stabilize) -> delt_side; the explosive dumbbell swing is glute-driven (the
-- glutes are the main hip-extension power source; hamstrings assist, erectors
-- stabilize) -> glutes.
-- Applies the 2 PRIMARY corrections (the regenerated 20260604120200 seed bakes
-- them in for fresh resets via build-seed.ts primary-overrides.json) and promotes
-- both rows to is_verified=true. Idempotent; guarded on source='free-exercise-db'
-- so it never touches user- or system-authored rows. Verified total 869 -> 871;
-- only the 2 #160-held rows remain is_verified=false.

-- 1) primary-tag corrections (2 rows)
update public.exercises e
set primary_muscles = v.prim
from (values
  ('Push_Press_-_Behind_the_Neck', array['delt_side']::text[]),
  ('Vertical_Swing', array['glutes']::text[])
) as v(external_id, prim)
where e.external_id = v.external_id and e.source = 'free-exercise-db';

-- 2) verify the 2 now-resolved rows.
update public.exercises
set is_verified = true
where source = 'free-exercise-db' and external_id in (
  'Push_Press_-_Behind_the_Neck',
  'Vertical_Swing'
);
