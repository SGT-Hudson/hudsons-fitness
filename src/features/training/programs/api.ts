import { supabase } from '@/lib/supabase';
import type { Tables, Json } from '@/types/database';

export type Program = Tables<'programs'>;
export type ProgramDay = Tables<'program_days'>;

export interface ProgramWithDays extends Program {
  program_days: ProgramDay[];
}

export interface SaveProgramPayload {
  programId: string | null;
  name: string;
  days: Array<{ day_index: number; is_rest: boolean; routine_id: string | null }>;
}

export async function listPrograms(userId: string): Promise<ProgramWithDays[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*, program_days(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as ProgramWithDays[];
  for (const p of rows) {
    p.program_days = (p.program_days ?? []).sort((a, b) => a.day_index - b.day_index);
  }
  return rows;
}

export async function fetchActiveProgram(userId: string): Promise<ProgramWithDays | null> {
  const { data, error } = await supabase
    .from('programs')
    .select('*, program_days(*)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as ProgramWithDays;
  row.program_days = (row.program_days ?? []).sort((a, b) => a.day_index - b.day_index);
  return row;
}

export async function saveProgram(payload: SaveProgramPayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_program', {
    p_program_id: payload.programId,
    p_name: payload.name,
    p_days: payload.days as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export async function setActiveProgram(programId: string, anchorDateISO: string): Promise<void> {
  const { error } = await supabase.rpc('set_active_program', {
    p_program_id: programId,
    p_anchor_date: anchorDateISO,
  });
  if (error) throw error;
}

export async function deleteProgram(programId: string): Promise<void> {
  const { error } = await supabase.from('programs').delete().eq('id', programId);
  if (error) throw error;
}
