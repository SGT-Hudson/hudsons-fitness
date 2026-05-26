import type { MuscleCode } from '@/core/muscleVolume';

export type Gender = 'male' | 'female';
export type Side = 'front' | 'back';

export interface BodyPart {
  slug: string;
  paths: string[]; // SVG path 'd' strings
}

export interface BodyArtSkin {
  id: string;
  viewBox(gender: Gender, side: Side): string;
  parts(gender: Gender, side: Side): BodyPart[];
  /** Skin-specific slugs → our coarse-12 codes; unmapped slugs render neutral. */
  slugToMuscle: Partial<Record<string, MuscleCode>>;
}
