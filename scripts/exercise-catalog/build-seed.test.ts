import { describe, expect, it } from 'vitest';
import {
  mapEquipment,
  mapFineMuscle,
  imagePaths,
  buildRow,
  type RawExercise,
} from './build-seed';

// ── equipment map (§5, 1:1 lossless) ──────────────────────────────────────────
describe('mapEquipment', () => {
  it('maps each dataset value to ours', () => {
    expect(mapEquipment('body only')).toBe('bodyweight');
    expect(mapEquipment('bands')).toBe('band');
    expect(mapEquipment('kettlebells')).toBe('kettlebell');
    expect(mapEquipment('e-z curl bar')).toBe('ez_curl_bar');
    expect(mapEquipment('medicine ball')).toBe('medicine_ball');
    expect(mapEquipment('exercise ball')).toBe('exercise_ball');
    expect(mapEquipment('foam roll')).toBe('foam_roller');
    expect(mapEquipment('barbell')).toBe('barbell');
    expect(mapEquipment('dumbbell')).toBe('dumbbell');
    expect(mapEquipment('cable')).toBe('cable');
    expect(mapEquipment('machine')).toBe('machine');
    expect(mapEquipment('other')).toBe('other');
  });
  it('returns null for missing equipment', () => {
    expect(mapEquipment(null)).toBeNull();
  });
});

// ── fine-muscle map (§7) ──────────────────────────────────────────────────────
describe('mapFineMuscle', () => {
  it('1:1 maps pass straight through', () => {
    expect(mapFineMuscle('biceps', 'Barbell Curl')).toBe('biceps');
    expect(mapFineMuscle('lats', 'Pull-up')).toBe('lat');
    expect(mapFineMuscle('lower back', 'Good Morning')).toBe('lower_back');
    expect(mapFineMuscle('middle back', 'Seated Row')).toBe('rhomboids');
    expect(mapFineMuscle('quadriceps', 'Leg Extension')).toBe('quads');
    expect(mapFineMuscle('traps', 'Shrug')).toBe('trap');
    expect(mapFineMuscle('neck', 'Neck Curl')).toBe('neck');
    expect(mapFineMuscle('abductors', 'Hip Abduction')).toBe('abductors');
    expect(mapFineMuscle('adductors', 'Hip Adduction')).toBe('adductors');
    expect(mapFineMuscle('calves', 'Calf Raise')).toBe('calves');
    expect(mapFineMuscle('forearms', 'Wrist Curl')).toBe('forearms');
    expect(mapFineMuscle('glutes', 'Hip Thrust')).toBe('glutes');
    expect(mapFineMuscle('hamstrings', 'Leg Curl')).toBe('hamstrings');
  });

  it('chest disambiguates by incline/decline, else pec_lower', () => {
    expect(mapFineMuscle('chest', 'Incline Bench Press')).toBe('pec_upper');
    expect(mapFineMuscle('chest', 'Decline Bench Press')).toBe('pec_lower');
    expect(mapFineMuscle('chest', 'Bench Press')).toBe('pec_lower');
  });

  it('shoulders disambiguates by keyword, else delt_side', () => {
    expect(mapFineMuscle('shoulders', 'Dumbbell Lateral Raise')).toBe('delt_side');
    expect(mapFineMuscle('shoulders', 'Lateral To Front Raise')).toBe('delt_side');
    expect(mapFineMuscle('shoulders', 'Reverse Fly')).toBe('delt_rear');
    expect(mapFineMuscle('shoulders', 'Rear Delt Raise')).toBe('delt_rear');
    expect(mapFineMuscle('shoulders', 'Face Pull')).toBe('delt_rear');
    expect(mapFineMuscle('shoulders', 'Front Raise')).toBe('delt_front');
    expect(mapFineMuscle('shoulders', 'Overhead Press')).toBe('delt_front');
    expect(mapFineMuscle('shoulders', 'Military Press')).toBe('delt_front');
    expect(mapFineMuscle('shoulders', 'Arnold Press')).toBe('delt_front');
    expect(mapFineMuscle('shoulders', 'Cable Shoulder Thing')).toBe('delt_side');
  });

  it('triceps disambiguates by keyword, else tri_lateral', () => {
    expect(mapFineMuscle('triceps', 'Overhead Triceps Extension')).toBe('tri_long');
    expect(mapFineMuscle('triceps', 'Skullcrusher')).toBe('tri_long');
    expect(mapFineMuscle('triceps', 'French Press')).toBe('tri_long');
    expect(mapFineMuscle('triceps', 'Lying Triceps Press')).toBe('tri_long');
    expect(mapFineMuscle('triceps', 'Triceps Pushdown')).toBe('tri_lateral');
    expect(mapFineMuscle('triceps', 'Triceps Kickback')).toBe('tri_lateral');
    expect(mapFineMuscle('triceps', 'Bench Dip')).toBe('tri_lateral');
    expect(mapFineMuscle('triceps', 'Cable Triceps Thing')).toBe('tri_lateral');
  });

  it('abdominals disambiguates lower vs upper', () => {
    expect(mapFineMuscle('abdominals', 'Hanging Leg Raise')).toBe('abs_lower');
    expect(mapFineMuscle('abdominals', 'Reverse Crunch')).toBe('abs_lower');
    expect(mapFineMuscle('abdominals', 'Hanging Knee Raise')).toBe('abs_lower');
    expect(mapFineMuscle('abdominals', 'Crunch')).toBe('abs_upper');
    expect(mapFineMuscle('abdominals', 'Cable Crunch')).toBe('abs_upper');
  });

  it('returns null for an unknown coarse code', () => {
    expect(mapFineMuscle('bogus', 'Whatever')).toBeNull();
  });
});

// ── image relative paths (§6) ─────────────────────────────────────────────────
describe('imagePaths', () => {
  it('passes the dataset relative paths through verbatim', () => {
    expect(imagePaths(['Barbell_Curl/0.jpg', 'Barbell_Curl/1.jpg'])).toEqual([
      'Barbell_Curl/0.jpg',
      'Barbell_Curl/1.jpg',
    ]);
  });
  it('tolerates a missing images array', () => {
    expect(imagePaths(undefined)).toEqual([]);
  });
});

// ── buildRow (the seed VALUES tuple) ──────────────────────────────────────────
const raw: RawExercise = {
  id: 'Barbell_Curl',
  name: 'Barbell Curl',
  force: 'pull',
  level: 'beginner',
  mechanic: 'isolation',
  equipment: 'barbell',
  primaryMuscles: ['biceps'],
  secondaryMuscles: ['forearms'],
  category: 'strength',
  images: ['Barbell_Curl/0.jpg', 'Barbell_Curl/1.jpg'],
};

describe('buildRow', () => {
  it('emits a data-only VALUES tuple with ES name, fine tags, arrays, escaped quotes', () => {
    expect(buildRow(raw, 'Curl con barra')).toBe(
      "  ('Curl con barra', 'Barbell Curl', array['biceps'], array['forearms'], " +
        "'barbell', 'beginner', 'isolation', 'pull', 'strength', " +
        "array['Barbell_Curl/0.jpg','Barbell_Curl/1.jpg'], 'Barbell_Curl')",
    );
  });

  it('escapes single quotes in names and emits empty arrays/nulls correctly', () => {
    const r: RawExercise = {
      id: "Farmer's_Walk",
      name: "Farmer's Walk",
      force: null,
      level: 'beginner',
      mechanic: null,
      equipment: null,
      primaryMuscles: ['forearms'],
      secondaryMuscles: [],
      category: 'strongman',
      images: [],
    };
    expect(buildRow(r, "Paseo del granjero")).toBe(
      "  ('Paseo del granjero', 'Farmer''s Walk', array['forearms'], array[]::text[], " +
        "null, 'beginner', null, null, 'strongman', array[]::text[], 'Farmer''s_Walk')",
    );
  });
});
