import { supabase } from '@/lib/supabase';
import type { Json, Tables } from '@/types/database';
import type { CoreSessionSet } from '@/core/training';

export type WorkoutSession = Tables<'workout_sessions'>;
export type WorkoutSet = Tables<'workout_sets'>;

export interface SessionListItem {
  id: string;
  performed_on: string;
  title: string | null;
  set_count: number;
}

export interface SessionWithSets extends WorkoutSession {
  workout_sets: WorkoutSet[];
}

export interface SaveWorkoutSet {
  exercise_id: string;
  set_index: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  is_warmup: boolean;
}

export interface SaveWorkoutPayload {
  sessionId: string | null;
  performedOn: string; // YYYY-MM-DD
  title: string | null;
  notes: string | null;
  sets: SaveWorkoutSet[];
  programId?: string | null;
  routineId?: string | null;
}

export async function listSessions(userId: string, limit = 50): Promise<SessionListItem[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id, performed_on, title, workout_sets(id)')
    .eq('user_id', userId)
    .order('performed_on', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    performed_on: s.performed_on,
    title: s.title,
    set_count: s.workout_sets?.length ?? 0,
  }));
}

export async function fetchSession(sessionId: string): Promise<SessionWithSets> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*, workout_sets(*)')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  const raw = data as unknown as SessionWithSets;
  raw.workout_sets = (raw.workout_sets ?? [])
    .slice()
    .sort(
      (a, b) =>
        a.exercise_id.localeCompare(b.exercise_id) || a.set_index - b.set_index,
    );
  return raw;
}

/**
 * Per-exercise history across all the user's sessions. Returns the
 * `CoreSessionSet` shape consumed by the pure derivations in
 * `@/core/training` (e1rmTrendForExercise, detectPRsForExercise,
 * lastWorkingSetForExercise, evaluateCoach).
 *
 * RLS already scopes by user, but we defensively re-filter on `user_id`
 * in case the join cache ever surfaces a row we shouldn't see.
 */
export async function fetchExerciseHistory(
  userId: string,
  exerciseId: string,
): Promise<CoreSessionSet[]> {
  const { data, error } = await supabase
    .from('workout_sets')
    .select(
      'reps, weight_kg, rpe, is_warmup, set_index, session_id, exercise_id, session:workout_sessions(performed_on, user_id)',
    )
    .eq('exercise_id', exerciseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  type Row = {
    reps: number;
    weight_kg: number | string;
    rpe: number | string | null;
    is_warmup: boolean;
    set_index: number;
    session_id: string;
    exercise_id: string;
    session: { performed_on: string; user_id: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  return rows
    .filter((r): r is Row & { session: { performed_on: string; user_id: string } } =>
      r.session !== null && r.session.user_id === userId,
    )
    .map((r) => ({
      reps: r.reps,
      weightKg: r.weight_kg,
      rpe: r.rpe,
      isWarmup: r.is_warmup,
      setIndex: r.set_index,
      sessionId: r.session_id,
      exerciseId: r.exercise_id,
      performedOn: r.session.performed_on,
    }));
}

export async function saveWorkout(payload: SaveWorkoutPayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_workout', {
    p_session_id: payload.sessionId,
    p_performed_on: payload.performedOn,
    p_title: payload.title,
    p_notes: payload.notes,
    p_sets: payload.sets as unknown as Json,
    p_program_id: payload.programId ?? null,
    p_routine_id: payload.routineId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('workout_sessions').delete().eq('id', sessionId);
  if (error) throw error;
}
