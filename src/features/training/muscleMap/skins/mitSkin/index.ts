import type { BodyArtSkin, BodyPart, Gender, Side } from '../types';
import { bodyFront } from './bodyFront';
import { bodyBack } from './bodyBack';
import { bodyFemaleFront } from './bodyFemaleFront';
import { bodyFemaleBack } from './bodyFemaleBack';

// MIT artwork from react-native-body-highlighter (see ./LICENSE).
// Region slugs map to fine codes via src/core/muscles.ts (codesForBodyRegion);
// the render layer (MuscleBody) sums the fine codes that share a region.
function parts(gender: Gender, side: Side): BodyPart[] {
  if (gender === 'female') return side === 'front' ? bodyFemaleFront : bodyFemaleBack;
  return side === 'front' ? bodyFront : bodyBack;
}

export const mitSkin: BodyArtSkin = {
  id: 'mit',
  viewBox: (_gender, side) => (side === 'front' ? '0 0 724 1448' : '724 0 724 1448'),
  parts,
};

export const ACTIVE_SKIN: BodyArtSkin = mitSkin;
