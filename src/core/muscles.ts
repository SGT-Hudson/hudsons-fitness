// Canonical structural definition of the fine muscle taxonomy (Project A).
// This is the RUNTIME source of truth in the client; the DB `muscles` table
// mirrors it for the referential-integrity trigger, and muscles.test.ts +
// the Tier-3 pgTAP suite assert the two never drift.

export type MuscleGroup = 'shoulders' | 'chest' | 'back' | 'arms' | 'core' | 'legs';

export interface MuscleDef {
  code: string;
  group: MuscleGroup | 'full_body';
  /** Current MIT skin region this code shades; null for full_body. */
  bodyRegionSlug: string | null;
  displayOrder: number;
  isFullBody: boolean;
}

export const MUSCLES: readonly MuscleDef[] = [
  { code: 'delt_front',  group: 'shoulders', bodyRegionSlug: 'deltoids',   displayOrder: 1,  isFullBody: false },
  { code: 'delt_side',   group: 'shoulders', bodyRegionSlug: 'deltoids',   displayOrder: 2,  isFullBody: false },
  { code: 'delt_rear',   group: 'shoulders', bodyRegionSlug: 'deltoids',   displayOrder: 3,  isFullBody: false },
  { code: 'pec_upper',   group: 'chest',     bodyRegionSlug: 'chest',      displayOrder: 4,  isFullBody: false },
  { code: 'pec_lower',   group: 'chest',     bodyRegionSlug: 'chest',      displayOrder: 5,  isFullBody: false },
  { code: 'lat',         group: 'back',      bodyRegionSlug: 'upper-back', displayOrder: 6,  isFullBody: false },
  { code: 'trap',        group: 'back',      bodyRegionSlug: 'trapezius',  displayOrder: 7,  isFullBody: false },
  { code: 'rhomboids',   group: 'back',      bodyRegionSlug: 'upper-back', displayOrder: 8,  isFullBody: false },
  { code: 'lower_back',  group: 'back',      bodyRegionSlug: 'lower-back', displayOrder: 9,  isFullBody: false },
  { code: 'neck',        group: 'back',      bodyRegionSlug: 'neck',       displayOrder: 23, isFullBody: false },
  { code: 'biceps',      group: 'arms',      bodyRegionSlug: 'biceps',     displayOrder: 10, isFullBody: false },
  { code: 'tri_long',    group: 'arms',      bodyRegionSlug: 'triceps',    displayOrder: 11, isFullBody: false },
  { code: 'tri_lateral', group: 'arms',      bodyRegionSlug: 'triceps',    displayOrder: 12, isFullBody: false },
  { code: 'forearms',    group: 'arms',      bodyRegionSlug: 'forearm',    displayOrder: 13, isFullBody: false },
  { code: 'abs_upper',   group: 'core',      bodyRegionSlug: 'abs',        displayOrder: 14, isFullBody: false },
  { code: 'abs_lower',   group: 'core',      bodyRegionSlug: 'abs',        displayOrder: 15, isFullBody: false },
  { code: 'obliques',    group: 'core',      bodyRegionSlug: 'obliques',   displayOrder: 16, isFullBody: false },
  { code: 'quads',       group: 'legs',      bodyRegionSlug: 'quadriceps', displayOrder: 17, isFullBody: false },
  { code: 'hamstrings',  group: 'legs',      bodyRegionSlug: 'hamstring',  displayOrder: 18, isFullBody: false },
  { code: 'glutes',      group: 'legs',      bodyRegionSlug: 'gluteal',    displayOrder: 19, isFullBody: false },
  { code: 'abductors',   group: 'legs',      bodyRegionSlug: 'gluteal',    displayOrder: 24, isFullBody: false },
  { code: 'adductors',   group: 'legs',      bodyRegionSlug: 'adductors',  displayOrder: 20, isFullBody: false },
  { code: 'calves',      group: 'legs',      bodyRegionSlug: 'calves',     displayOrder: 21, isFullBody: false },
  { code: 'tibialis',    group: 'legs',      bodyRegionSlug: 'tibialis',   displayOrder: 22, isFullBody: false },
  { code: 'full_body',   group: 'full_body', bodyRegionSlug: null,         displayOrder: 99, isFullBody: true },
];

/** The 24 shadeable fine codes (excludes full_body). */
export const MUSCLE_CODES = MUSCLES.filter((m) => !m.isFullBody).map((m) => m.code) as readonly string[];

/** The six taggable groups, in display order. */
export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'shoulders', 'chest', 'back', 'arms', 'core', 'legs',
];

const SLUG_BY_CODE = new Map(MUSCLES.map((m) => [m.code, m.bodyRegionSlug]));

export function bodyRegionSlugForCode(code: string): string | null {
  return SLUG_BY_CODE.get(code) ?? null;
}

/** All shadeable fine codes whose art region is `slug` (inverts the map). */
export function codesForBodyRegion(slug: string): string[] {
  return MUSCLES.filter((m) => !m.isFullBody && m.bodyRegionSlug === slug).map((m) => m.code);
}

/** Codes of a group, in display order — used to render the grouped tagging UI. */
export function codesInGroup(group: MuscleGroup): string[] {
  return MUSCLES.filter((m) => m.group === group)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((m) => m.code);
}
