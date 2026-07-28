-- R-32 e2e smoke fixture. LOCAL STACKS ONLY — applied by the e2e step in CI
-- and by scripts/e2e-local.sh; never part of supabase/seed.sql or any deploy.
-- Idempotent per row: deterministic UUIDs + bare ON CONFLICT DO NOTHING.
begin;

-- Auth user (password: e2e-smoke-password). Token columns are '' on purpose:
-- GoTrue scans them into non-nullable Go strings and NULL breaks login.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-4000-8000-0000000e2e00', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'e2e-smoke@hudsonsfitness.test',
  extensions.crypt('e2e-smoke-password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
) on conflict do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values (
  '00000000-0000-4000-8000-0000000e2e01', '00000000-0000-4000-8000-0000000e2e00',
  '00000000-0000-4000-8000-0000000e2e00',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000e2e00',
    'email', 'e2e-smoke@hudsonsfitness.test', 'email_verified', true
  ),
  'email', now(), now(), now()
) on conflict do nothing;

-- The on_auth_user_created trigger already created the profiles row.
-- Onboarding-complete = sex + birth_date + height_cm + initial_weight_kg non-null.
update public.profiles set
  display_name = 'E2E Smoke', language = 'es', sex = 'male',
  birth_date = '1990-01-01', height_cm = 180.0, initial_weight_kg = 80.0
where id = '00000000-0000-4000-8000-0000000e2e00';

-- /progress/goals
insert into public.goals (user_id)
values ('00000000-0000-4000-8000-0000000e2e00')
on conflict do nothing;

-- Active phase (diary macros + progress).
insert into public.phases (id, user_id, name, phase_type, start_date, kcal_mode, kcal_value)
values ('00000000-0000-4000-8000-0000000e2e02', '00000000-0000-4000-8000-0000000e2e00',
        'Fase E2E', 'maintenance', current_date - 30, 'absolute', 2200)
on conflict do nothing;

-- /recipes/ingredients — pool row + the user's library ref.
insert into public.ingredients (id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit)
values ('00000000-0000-4000-8000-0000000e2e03', 'Arroz E2E', 130, 2.5, 28, 0.3)
on conflict do nothing;

insert into public.user_ingredient_refs (user_id, ingredient_id)
values ('00000000-0000-4000-8000-0000000e2e00', '00000000-0000-4000-8000-0000000e2e03')
on conflict do nothing;

-- /recipes — pool row + library ref + one ingredient line + one step.
insert into public.recipes (id, created_by_user_id, name, servings, meal_types)
values ('00000000-0000-4000-8000-0000000e2e04', '00000000-0000-4000-8000-0000000e2e00',
        'Pollo con arroz E2E', 1, '{lunch,dinner}')
on conflict do nothing;

insert into public.user_recipe_refs (user_id, recipe_id)
values ('00000000-0000-4000-8000-0000000e2e00', '00000000-0000-4000-8000-0000000e2e04')
on conflict do nothing;

insert into public.recipe_ingredients (id, recipe_id, ingredient_id, quantity)
values ('00000000-0000-4000-8000-0000000e2e05', '00000000-0000-4000-8000-0000000e2e04',
        '00000000-0000-4000-8000-0000000e2e03', 100)
on conflict do nothing;

insert into public.recipe_steps (id, recipe_id, text, display_order)
values ('00000000-0000-4000-8000-0000000e2e06', '00000000-0000-4000-8000-0000000e2e04',
        'Cocinar el arroz y el pollo.', 0)
on conflict do nothing;

-- /templates
insert into public.meal_plan_templates (id, user_id, name)
values ('00000000-0000-4000-8000-0000000e2e07', '00000000-0000-4000-8000-0000000e2e00', 'Plantilla E2E')
on conflict do nothing;

insert into public.meal_plan_template_slots (id, template_id, day_of_week, meal_index, recipe_id)
values ('00000000-0000-4000-8000-0000000e2e08', '00000000-0000-4000-8000-0000000e2e07',
        0, 0, '00000000-0000-4000-8000-0000000e2e04')
on conflict do nothing;

-- /planner — current ISO week (date_trunc('week', …) = Monday) + one slot today.
insert into public.meal_plan_weeks (id, user_id, week_start)
values ('00000000-0000-4000-8000-0000000e2e09', '00000000-0000-4000-8000-0000000e2e00',
        date_trunc('week', current_date)::date)
on conflict do nothing;

insert into public.meal_plan_week_slots (id, plan_week_id, date, meal_index, recipe_id)
values ('00000000-0000-4000-8000-0000000e2e0a', '00000000-0000-4000-8000-0000000e2e09',
        current_date, 0, '00000000-0000-4000-8000-0000000e2e04')
on conflict do nothing;

-- /diary — two custom meals today (custom_name path of meal_log_one_source).
insert into public.meal_logs (id, user_id, logged_on, meal_type, custom_name,
                              custom_kcal, custom_protein_g, custom_carbs_g, custom_fat_g)
values
  ('00000000-0000-4000-8000-0000000e2e0b', '00000000-0000-4000-8000-0000000e2e00',
   current_date, 'breakfast', 'Desayuno E2E', 420, 25, 45, 14),
  ('00000000-0000-4000-8000-0000000e2e0c', '00000000-0000-4000-8000-0000000e2e00',
   current_date, 'lunch', 'Comida E2E', 650, 40, 60, 20)
on conflict do nothing;

-- /routine + /training — routine with one catalog exercise, one logged session.
-- The exercise catalog is seeded by migrations (34 system + 873 free-exercise-db
-- rows): reference one, never create one.
insert into public.routines (id, user_id, name)
values ('00000000-0000-4000-8000-0000000e2e0d', '00000000-0000-4000-8000-0000000e2e00', 'Rutina E2E')
on conflict do nothing;

insert into public.routine_exercises (id, routine_id, exercise_id, position,
                                      target_sets, target_reps_min, target_reps_max)
select '00000000-0000-4000-8000-0000000e2e0e', '00000000-0000-4000-8000-0000000e2e0d',
       e.id, 1, 3, 8, 12
from public.exercises e where e.source = 'system' order by e.name_es limit 1
on conflict do nothing;

insert into public.workout_sessions (id, user_id, routine_id, performed_on)
values ('00000000-0000-4000-8000-0000000e2e0f', '00000000-0000-4000-8000-0000000e2e00',
        '00000000-0000-4000-8000-0000000e2e0d', current_date - 2)
on conflict do nothing;

insert into public.workout_sets (id, session_id, exercise_id, set_index, reps, weight_kg)
select '00000000-0000-4000-8000-0000000e2e10', '00000000-0000-4000-8000-0000000e2e0f',
       e.id, 1, 10, 50
from public.exercises e where e.source = 'system' order by e.name_es limit 1
on conflict do nothing;

-- /progress — two measurements so the chart has a line.
insert into public.body_measurements (id, user_id, measured_on, weight_kg, body_fat_pct)
values
  ('00000000-0000-4000-8000-0000000e2e11', '00000000-0000-4000-8000-0000000e2e00',
   current_date - 7, 81.2, 18.5),
  ('00000000-0000-4000-8000-0000000e2e12', '00000000-0000-4000-8000-0000000e2e00',
   current_date - 1, 80.6, 18.2)
on conflict do nothing;

commit;
