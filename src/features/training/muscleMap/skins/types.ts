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
}
