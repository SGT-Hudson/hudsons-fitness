import { supabase } from '@/lib/supabase';
import { isoDate } from '@/lib/dates';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';

export type Phase = Tables<'phases'>;
export type PhaseInput = Omit<TablesInsert<'phases'>, 'id' | 'user_id' | 'created_at'>;

export async function listPhases(userId: string): Promise<Phase[]> {
  const { data, error } = await supabase
    .from('phases')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchActivePhase(userId: string): Promise<Phase | null> {
  const today = isoDate();
  const { data, error } = await supabase
    .from('phases')
    .select('*')
    .eq('user_id', userId)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPhase(userId: string, input: PhaseInput): Promise<Phase> {
  const { data, error } = await supabase
    .from('phases')
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePhase(id: string, patch: TablesUpdate<'phases'>): Promise<Phase> {
  const { data, error } = await supabase
    .from('phases')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePhase(id: string): Promise<void> {
  const { error } = await supabase.from('phases').delete().eq('id', id);
  if (error) throw error;
}
