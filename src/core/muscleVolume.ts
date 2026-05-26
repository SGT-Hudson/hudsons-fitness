export const SECONDARY_SET_WEIGHT = 0.5;

export const MUSCLE_CODES = [
  'chest',
  'back',
  'shoulders',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'biceps',
  'triceps',
  'core',
  'forearms',
] as const;
export type MuscleCode = (typeof MUSCLE_CODES)[number];

export interface SetInput {
  performedOn: string;
  isWarmup: boolean;
  primaryMuscle: MuscleCode | 'full_body' | null;
  secondaryMuscles: MuscleCode[];
}

export interface MuscleVolume {
  byMuscle: Record<MuscleCode, number>;
  fullBodySetCount: number;
  totalWorkingSets: number;
  maxMuscleValue: number;
}

function emptyByMuscle(): Record<MuscleCode, number> {
  return Object.fromEntries(MUSCLE_CODES.map((m) => [m, 0])) as Record<MuscleCode, number>;
}

/**
 * Aggregate working-set volume per muscle. Primary mover earns 1 per working
 * set; each secondary mover earns SECONDARY_SET_WEIGHT. Warm-ups are excluded;
 * `full_body` sets are counted separately (footnote) and do not shade the map.
 * `windowStart` is an inclusive ISO-date lower bound, or null for all-time.
 */
export function computeMuscleVolume(
  sets: SetInput[],
  windowStart: string | null,
): MuscleVolume {
  const byMuscle = emptyByMuscle();
  let fullBodySetCount = 0;
  let totalWorkingSets = 0;

  for (const set of sets) {
    if (set.isWarmup) continue;
    if (windowStart !== null && set.performedOn < windowStart) continue;
    totalWorkingSets += 1;

    if (set.primaryMuscle === 'full_body') {
      fullBodySetCount += 1;
      continue;
    }
    if (set.primaryMuscle === null) continue;

    byMuscle[set.primaryMuscle] += 1;
    for (const sec of set.secondaryMuscles) {
      byMuscle[sec] += SECONDARY_SET_WEIGHT;
    }
  }

  const maxMuscleValue = Math.max(0, ...Object.values(byMuscle));
  return { byMuscle, fullBodySetCount, totalWorkingSets, maxMuscleValue };
}
