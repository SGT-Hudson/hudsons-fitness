import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type PlanWeek = Tables<'meal_plan_weeks'>;
export type PlanWeekSlot = Tables<'meal_plan_week_slots'>;

export interface WeekSlotWithRecipe {
  id: string;
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  display_order: number;
}

export interface ActiveWeek {
  id: string;
  week_start: string;
  source_template_id: string | null;
  source_template_name: string | null;
  has_diverged: boolean;
  slots: WeekSlotWithRecipe[];
}

export async function fetchActiveWeek(
  userId: string,
  weekStart: string,
): Promise<ActiveWeek | null> {
  const { data, error } = await supabase
    .from('meal_plan_weeks')
    .select(
      `id, week_start, source_template_id, has_diverged,
       source_template:meal_plan_templates (id, name),
       meal_plan_week_slots (
         id, date, meal_index, meal_time, recipe_id, servings, display_order,
         recipe:recipes (id, name)
       )`,
    )
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  interface RawSlot {
    id: string;
    date: string;
    meal_index: number;
    meal_time: string | null;
    recipe_id: string;
    servings: number;
    display_order: number;
    recipe: { name: string } | { name: string }[];
  }
  const raw = data as unknown as {
    id: string;
    week_start: string;
    source_template_id: string | null;
    has_diverged: boolean;
    source_template: { id: string; name: string } | { id: string; name: string }[] | null;
    meal_plan_week_slots: RawSlot[];
  };
  const tpl = Array.isArray(raw.source_template) ? raw.source_template[0] : raw.source_template;
  return {
    id: raw.id,
    week_start: raw.week_start,
    source_template_id: raw.source_template_id,
    source_template_name: tpl?.name ?? null,
    has_diverged: raw.has_diverged,
    slots: raw.meal_plan_week_slots
      .map((s) => {
        const recipe = Array.isArray(s.recipe) ? s.recipe[0] : s.recipe;
        return {
          id: s.id,
          date: s.date,
          meal_index: s.meal_index,
          meal_time: s.meal_time,
          recipe_id: s.recipe_id,
          recipe_name: recipe?.name ?? '?',
          servings: Number(s.servings),
          display_order: s.display_order,
        };
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.meal_index - b.meal_index ||
          a.display_order - b.display_order,
      ),
  };
}

export async function applyTemplateToWeek(
  templateId: string,
  targetDate: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('apply_template_to_week', {
    p_template_id: templateId,
    p_target_date: targetDate,
  });
  if (error) throw error;
  return data as string;
}

export async function saveWeekAsTemplate(weekId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('save_week_as_template', {
    p_week_id: weekId,
    p_name: name,
  });
  if (error) throw error;
  return data as string;
}

export async function addWeekSlot(input: {
  plan_week_id: string;
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  servings: number;
  display_order: number;
}): Promise<PlanWeekSlot> {
  const { data, error } = await supabase
    .from('meal_plan_week_slots')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateWeekSlot(
  id: string,
  patch: { servings?: number; recipe_id?: string },
): Promise<PlanWeekSlot> {
  const { data, error } = await supabase
    .from('meal_plan_week_slots')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWeekSlot(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plan_week_slots').delete().eq('id', id);
  if (error) throw error;
}
