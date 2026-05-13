import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert } from '@/types/database';

export type Goal = Tables<'goals'>;
export type GoalInput = Pick<TablesInsert<'goals'>, 'target_body_fat_pct' | 'notes'>;

export async function fetchGoal(userId: string): Promise<Goal | null> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertGoal(userId: string, input: GoalInput): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .upsert(
      { user_id: userId, ...input, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
