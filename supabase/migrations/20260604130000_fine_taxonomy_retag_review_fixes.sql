-- Project A follow-up — anatomical review of the #155 system re-tags.
-- A post-merge expert review of the 34 fine-taxonomy re-tags surfaced 3 corrections
-- (the rest were verified sound). Data-only; system rows; no prod users → in-place.
-- Idempotent: each row is set to a fixed array, so re-running is a no-op.

-- 1) Conventional deadlift: hamstrings is a co-prime mover of hip extension (with
--    glutes + erectors), not a 0.5 synergist → promote to primary.
update public.exercises
set primary_muscles   = array['lower_back','glutes','hamstrings'],
    secondary_muscles = array['quads','lat','trap','forearms']
where source = 'system' and name_en = 'Deadlift';

-- 2) Kettlebell swing: held, accelerating bell → real grip/forearm work, consistent
--    with every other held-load hinge in the seed (deadlift, RDL) → add forearms (0.5).
update public.exercises
set secondary_muscles = array['hamstrings','lower_back','delt_front','abs_upper','forearms']
where source = 'system' and name_en = 'Kettlebell swing';

-- 3) Overhead press: strict pressing recruits the upper trapezius for scapular
--    upward rotation to lockout → add trap (0.5).
update public.exercises
set secondary_muscles = array['delt_side','tri_lateral','tri_long','abs_upper','trap']
where source = 'system' and name_en = 'Overhead press';
