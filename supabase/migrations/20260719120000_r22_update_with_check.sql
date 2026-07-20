-- R-22 follow-up — every UPDATE policy in public carries an explicit WITH CHECK.
--
-- This closes no hole. Postgres applies an UPDATE policy's USING expression to
-- the NEW row when WITH CHECK is absent, so all fourteen policies below were
-- already covered — the pgTAP `todo` blocks that claimed otherwise had been
-- silently passing for months.
--
-- The clause is written anyway for two reasons: it states the intent instead of
-- leaving it to a Postgres subtlety the next reader has to know, and it is
-- insurance against a future edit that narrows USING alone, which would
-- otherwise stop covering the new row without a word.
--
-- ALTER POLICY, not drop-and-recreate: no policy body is retyped, so no nuance
-- can be lost in transcription. Each WITH CHECK repeats that policy's existing
-- USING exactly.

-- Simple ownership: the row's own user column.
alter policy "Users update own profile" on public.profiles
  using (auth.uid() = id) with check (auth.uid() = id);

alter policy "Users update own measurements" on public.body_measurements
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own goals" on public.goals
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own phases" on public.phases
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own meal logs" on public.meal_logs
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own daily history" on public.daily_nutrition_history
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own tdee" on public.tdee_estimates
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own templates" on public.meal_plan_templates
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own plan weeks" on public.meal_plan_weeks
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Child tables: ownership via a join to the parent. Without WITH CHECK these
-- were the ones the todo blocks claimed could be re-pointed into another
-- user's parent — they could not.
alter policy "Users update own template day times" on public.meal_plan_template_day_times
  using (
    exists (
      select 1 from public.meal_plan_templates t
      where t.id = meal_plan_template_day_times.template_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_plan_templates t
      where t.id = meal_plan_template_day_times.template_id and t.user_id = auth.uid()
    )
  );

alter policy "Users update own template slots" on public.meal_plan_template_slots
  using (
    exists (
      select 1 from public.meal_plan_templates t
      where t.id = meal_plan_template_slots.template_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_plan_templates t
      where t.id = meal_plan_template_slots.template_id and t.user_id = auth.uid()
    )
  );

alter policy "Users update own plan week slots" on public.meal_plan_week_slots
  using (
    exists (
      select 1 from public.meal_plan_weeks w
      where w.id = meal_plan_week_slots.plan_week_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_plan_weeks w
      where w.id = meal_plan_week_slots.plan_week_id and w.user_id = auth.uid()
    )
  );

alter policy "User updates own workout sets" on public.workout_sets
  using (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sets.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sets.session_id and s.user_id = auth.uid()
    )
  );

-- Recipes are a shared pool (R-01): writes are gated on the parent recipe's
-- real creator, and the LIBRARY_ANON_OWNER_ID sentinel never counts as one.
alter policy "Real owner updates own recipe ingredients" on public.recipe_ingredients
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  );
