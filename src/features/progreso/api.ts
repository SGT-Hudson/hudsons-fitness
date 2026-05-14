import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type DailyNutritionHistory = Tables<'daily_nutrition_history'>;

export async function fetchDailyNutritionHistory(
  userId: string,
  fromDate: string | null,
): Promise<DailyNutritionHistory[]> {
  let query = supabase
    .from('daily_nutrition_history')
    .select('*')
    .eq('user_id', userId)
    .order('logged_on', { ascending: true });
  if (fromDate) query = query.gte('logged_on', fromDate);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
