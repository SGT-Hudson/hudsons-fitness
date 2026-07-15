import type { MuscleCode } from '@/core/muscleVolume';
import { codesForBodyRegion } from '@/core/muscles';
import { ACTIVE_SKIN } from './skins/mitSkin';
import type { Gender, Side } from './skins/types';
import { muscleColor, NEUTRAL_PART } from './muscleColor';

interface Props {
  intensityByMuscle: Record<MuscleCode, number>;
  max: number;
  gender: Gender;
  side: Side;
}

export function MuscleBody({ intensityByMuscle, max, gender, side }: Props) {
  const skin = ACTIVE_SKIN;
  return (
    <svg
      viewBox={skin.viewBox(gender, side)}
      className="h-72 w-auto"
      role="img"
      aria-label={`body-${gender}-${side}`}
    >
      {skin.parts(gender, side).flatMap((part, pi) => {
        const codes = codesForBodyRegion(part.slug);
        const value = codes.reduce((sum, c) => sum + (intensityByMuscle[c] ?? 0), 0);
        const fill = codes.length > 0 ? muscleColor(value, max) : NEUTRAL_PART;
        return part.paths.map((d, di) => (
          <path key={`${pi}-${di}`} d={d} fill={fill} stroke="var(--bg-elev)" strokeWidth={0.6} />
        ));
      })}
    </svg>
  );
}
