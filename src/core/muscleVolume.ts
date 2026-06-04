import { MUSCLE_CODES } from './muscles';

export const SECONDARY_SET_WEIGHT = 0.5;

export { MUSCLE_CODES };
export type MuscleCode = (typeof MUSCLE_CODES)[number];

export interface SetInput {
  performedOn: string;
  isWarmup: boolean;
  /** Fine primary movers; `['full_body']` marks a footnoted whole-body set. */
  primaryMuscles: (MuscleCode | 'full_body')[];
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

const SHADEABLE = new Set<string>(MUSCLE_CODES);

/**
 * Aggregate working-set volume per fine muscle. Each primary mover earns 1.0,
 * each secondary earns SECONDARY_SET_WEIGHT — multiple primaries each earn 1.0
 * (stimulus is not conserved across a set; this is an activity map, not a set
 * count). Warm-ups are excluded; a set whose primaries include `full_body` is
 * counted separately (footnote) and never shades. `windowStart` is an inclusive
 * ISO-date lower bound, or null for all-time.
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

    if (set.primaryMuscles.includes('full_body')) {
      fullBodySetCount += 1;
      continue;
    }

    for (const p of set.primaryMuscles) {
      if (SHADEABLE.has(p)) byMuscle[p] += 1;
    }
    for (const sec of set.secondaryMuscles) {
      if (SHADEABLE.has(sec)) byMuscle[sec] += SECONDARY_SET_WEIGHT;
    }
  }

  const maxMuscleValue = Math.max(0, ...Object.values(byMuscle));
  return { byMuscle, fullBodySetCount, totalWorkingSets, maxMuscleValue };
}
