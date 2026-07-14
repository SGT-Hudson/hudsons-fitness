import { supabase } from '@/lib/supabase';
import { todayInTZ } from '@/lib/dates';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';

export type Phase = Tables<'phases'>;
export type PhaseInput = Omit<TablesInsert<'phases'>, 'id' | 'user_id' | 'created_at'>;

/**
 * Postgres `exclusion_violation`. `phases_user_id_daterange_excl` forbids two
 * phases of the same user from overlapping — and its daterange is INCLUSIVE
 * (`[]`), so two phases that merely share a boundary day already overlap. The
 * form's own `end_date > start_date` refine says nothing about OTHER phases;
 * only the server knows, and this is how it says so.
 */
export const PHASE_OVERLAP_CODE = '23P01';

/**
 * PostgREST rejects with a plain object (`{ code, message, details, hint }`),
 * **not** an `Error` — which is exactly why `toastError` degrades to the
 * generic "algo ha ido mal" on it. So this duck-types the code instead of
 * reaching for an instanceof that can never be true.
 */
export function isPhaseOverlapError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === PHASE_OVERLAP_CODE
  );
}

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
  // Canonical Europe/Madrid "today" (R-09 follow-up): "which phase is active
  // today" must use the same day boundary as the rest of the app, not the
  // host TZ (UTC in prod/CI would be a day off near Madrid midnight).
  const today = todayInTZ();
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
