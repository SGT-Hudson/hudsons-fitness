import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type TdeeEstimate = Tables<'tdee_estimates'>;

export async function fetchLatestTdee(
  userId: string,
): Promise<TdeeEstimate | null> {
  const { data, error } = await supabase
    .from('tdee_estimates')
    .select('*')
    .eq('user_id', userId)
    .order('computed_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
