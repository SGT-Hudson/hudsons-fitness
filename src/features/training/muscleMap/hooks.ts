import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { todayInTZ } from '@/lib/dates';
import { computeMuscleVolume, type MuscleVolume } from '@/core/muscleVolume';
import { fetchWorkoutSetsForVolume } from './api';

export type MuscleWindow = '7d' | '30d' | '6mo' | 'all';

/** Inclusive lower-bound ISO date for a window, or null for all-time. */
export function windowStartFor(win: MuscleWindow, today = todayInTZ()): string | null {
  if (win === 'all') return null;
  const d = new Date(today + 'T00:00:00Z');
  if (win === '7d') d.setUTCDate(d.getUTCDate() - 6); // inclusive 7-day span
  else if (win === '30d') d.setUTCDate(d.getUTCDate() - 29);
  else d.setUTCMonth(d.getUTCMonth() - 6);
  return d.toISOString().slice(0, 10);
}

export function useMuscleVolume(win: MuscleWindow) {
  const { user } = useAuth();
  const start = windowStartFor(win);
  return useQuery<MuscleVolume>({
    queryKey: ['muscle-volume', user?.id, win],
    enabled: !!user,
    queryFn: async () => {
      const sets = await fetchWorkoutSetsForVolume(start);
      return computeMuscleVolume(sets, start);
    },
  });
}
