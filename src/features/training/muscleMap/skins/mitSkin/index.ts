import type { MuscleCode } from '@/core/muscleVolume';
import type { BodyArtSkin, BodyPart, Gender, Side } from '../types';
import { bodyFront } from './bodyFront';
import { bodyBack } from './bodyBack';
import { bodyFemaleFront } from './bodyFemaleFront';
import { bodyFemaleBack } from './bodyFemaleBack';

// MIT artwork from react-native-body-highlighter (see ./LICENSE).
// The library's 23 region slugs aggregate up to our coarse-12 codes.
const slugToMuscle: Partial<Record<string, MuscleCode>> = {
  chest: 'chest',
  abs: 'core',
  obliques: 'core',
  deltoids: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearm: 'forearms',
  trapezius: 'back',
  'upper-back': 'back',
  'lower-back': 'back',
  gluteal: 'glutes',
  hamstring: 'hamstrings',
  quadriceps: 'quads',
  adductors: 'quads',
  calves: 'calves',
  tibialis: 'calves',
};

function parts(gender: Gender, side: Side): BodyPart[] {
  if (gender === 'female') return side === 'front' ? bodyFemaleFront : bodyFemaleBack;
  return side === 'front' ? bodyFront : bodyBack;
}

export const mitSkin: BodyArtSkin = {
  id: 'mit',
  viewBox: (_gender, side) => (side === 'front' ? '0 0 724 1448' : '724 0 724 1448'),
  parts,
  slugToMuscle,
};

export const ACTIVE_SKIN: BodyArtSkin = mitSkin;
