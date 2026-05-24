import { supabase } from '@/lib/supabase';
import type { Tables, Json } from '@/types/database';

export type Routine = Tables<'routines'>;
export type RoutineExercise = Tables<'routine_exercises'>;

/** Typed shape of a single warmup-set entry stored in routine_exercises.warmup_sets. */
export interface RoutineWarmupSet {
  pct: number;
  reps: number;
}

export interface RoutineWithExercises extends Routine {
  routine_exercises: RoutineExercise[];
}

export interface SaveRoutinePayload {
  routineId: string | null;
  name: string;
  notes: string | null;
  exercises: Array<{
    exercise_id: string;
    position: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number | null;
    target_rpe: number | null;
    warmup_sets: Array<{ pct: number; reps: number }>;
  }>;
}

export async function listRoutines(userId: string): Promise<RoutineWithExercises[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*, routine_exercises(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as RoutineWithExercises[];
  for (const r of rows) {
    r.routine_exercises = (r.routine_exercises ?? []).sort((a, b) => a.position - b.position);
  }
  return rows;
}

export async function fetchRoutine(routineId: string): Promise<RoutineWithExercises> {
  const { data, error } = await supabase
    .from('routines')
    .select('*, routine_exercises(*)')
    .eq('id', routineId)
    .single();
  if (error) throw error;
  const row = data as unknown as RoutineWithExercises;
  row.routine_exercises = (row.routine_exercises ?? []).sort((a, b) => a.position - b.position);
  return row;
}

export async function saveRoutine(payload: SaveRoutinePayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_routine', {
    p_routine_id: payload.routineId,
    p_name: payload.name,
    p_notes: payload.notes,
    p_exercises: payload.exercises as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', routineId);
  if (error) throw error;
}
