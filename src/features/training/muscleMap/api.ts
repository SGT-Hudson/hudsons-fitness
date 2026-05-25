import { supabase } from '@/lib/supabase';
import type { MuscleCode, SetInput } from '@/core/muscleVolume';

interface Row {
  is_warmup: boolean;
  session: { performed_on: string } | null;
  exercise: { primary_muscle: string | null; secondary_muscles: string[] } | null;
}

/**
 * Fetch the user's working-set rows for the volume map. RLS scopes
 * `workout_sessions` to the current user; the `!inner` joins keep only their
 * sets. `windowStart` (inclusive ISO date) filters server-side; null = all-time.
 */
export async function fetchWorkoutSetsForVolume(
  windowStart: string | null,
): Promise<SetInput[]> {
  let query = supabase
    .from('workout_sets')
    .select(
      'is_warmup, session:workout_sessions!inner(performed_on, user_id), ' +
        'exercise:exercises!inner(primary_muscle, secondary_muscles)',
    );
  if (windowStart !== null) {
    query = query.gte('session.performed_on', windowStart);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data as unknown as Row[]) ?? []).map((r) => ({
    performedOn: r.session?.performed_on ?? '',
    isWarmup: r.is_warmup,
    primaryMuscle: (r.exercise?.primary_muscle ?? null) as SetInput['primaryMuscle'],
    secondaryMuscles: (r.exercise?.secondary_muscles ?? []) as MuscleCode[],
  }));
}
