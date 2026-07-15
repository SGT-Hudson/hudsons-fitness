import { supabase } from '@/lib/supabase';
import type { Json, Tables } from '@/types/database';
import type { GridSlot } from './filledGrid';

export type Template = Tables<'meal_plan_templates'>;
export type TemplateSlot = Tables<'meal_plan_template_slots'>;

// Same three values as the meal_plan_templates.phase_type check constraint;
// null is first-class ("no phase") and must never be coerced to a default.
export type TemplatePhase = 'cut' | 'maintenance' | 'bulk';

export interface TemplateListItem {
  id: string;
  name: string;
  is_auto_generated: boolean;
  default_meal_times: string[];
  updated_at: string;
  slot_count: number;
  phase_type: TemplatePhase | null;
  /** Slot positions only — feeds the library card's week dot-grid. */
  slots: GridSlot[];
}

export interface TemplateSlotWithRecipe {
  id: string;
  day_of_week: number;
  meal_index: number;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  display_order: number;
}

export interface TemplateDetail {
  id: string;
  name: string;
  same_schedule_all_days: boolean;
  default_meal_times: string[];
  is_auto_generated: boolean;
  phase_type: TemplatePhase | null;
  slots: TemplateSlotWithRecipe[];
}

export async function listTemplates(userId: string): Promise<TemplateListItem[]> {
  const { data, error } = await supabase
    .from('meal_plan_templates')
    .select(
      'id, name, is_auto_generated, default_meal_times, updated_at, phase_type, meal_plan_template_slots(id, day_of_week, meal_index)',
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t) => {
    const slots = t.meal_plan_template_slots ?? [];
    return {
      id: t.id,
      name: t.name,
      is_auto_generated: t.is_auto_generated,
      default_meal_times: (t.default_meal_times as string[]) ?? [],
      updated_at: t.updated_at,
      slot_count: slots.length,
      phase_type: (t.phase_type as TemplatePhase | null) ?? null,
      slots: slots.map((s) => ({ day_of_week: s.day_of_week, meal_index: s.meal_index })),
    };
  });
}

interface RawTemplate {
  id: string;
  name: string;
  same_schedule_all_days: boolean;
  default_meal_times: string[];
  is_auto_generated: boolean;
  phase_type: TemplatePhase | null;
  meal_plan_template_slots: Array<{
    id: string;
    day_of_week: number;
    meal_index: number;
    recipe_id: string;
    servings: number;
    display_order: number;
    recipe: { id: string; name: string } | { id: string; name: string }[];
  }>;
}

export async function fetchTemplate(templateId: string): Promise<TemplateDetail> {
  const { data, error } = await supabase
    .from('meal_plan_templates')
    .select(
      `id, name, same_schedule_all_days, default_meal_times, is_auto_generated, phase_type,
       meal_plan_template_slots (
         id, day_of_week, meal_index, recipe_id, servings, display_order,
         recipe:recipes (id, name)
       )`,
    )
    .eq('id', templateId)
    .single();
  if (error) throw error;
  const raw = data as unknown as RawTemplate;
  return {
    id: raw.id,
    name: raw.name,
    same_schedule_all_days: raw.same_schedule_all_days,
    default_meal_times: (raw.default_meal_times as string[]) ?? [],
    is_auto_generated: raw.is_auto_generated,
    phase_type: raw.phase_type ?? null,
    slots: raw.meal_plan_template_slots
      .map((s) => {
        const recipe = Array.isArray(s.recipe) ? s.recipe[0] : s.recipe;
        return {
          id: s.id,
          day_of_week: s.day_of_week,
          meal_index: s.meal_index,
          recipe_id: s.recipe_id,
          recipe_name: recipe?.name ?? '?',
          servings: Number(s.servings),
          display_order: s.display_order,
        };
      })
      .sort(
        (a, b) =>
          a.day_of_week - b.day_of_week ||
          a.meal_index - b.meal_index ||
          a.display_order - b.display_order,
      ),
  };
}

export interface SaveTemplatePayload {
  templateId: string | null;
  name: string;
  sameScheduleAllDays: boolean;
  defaultMealTimes: string[];
  slots: Array<{
    day_of_week: number;
    meal_index: number;
    recipe_id: string;
    servings: number;
    display_order: number;
  }>;
  phaseType: TemplatePhase | null;
}

export async function saveTemplate(payload: SaveTemplatePayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_template', {
    p_template_id: payload.templateId,
    p_name: payload.name,
    p_same_schedule_all_days: payload.sameScheduleAllDays,
    p_default_meal_times: payload.defaultMealTimes,
    p_slots: payload.slots as unknown as Json,
    p_phase_type: payload.phaseType,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('meal_plan_templates')
    .delete()
    .eq('id', templateId);
  if (error) throw error;
}
