import { describe, expect, it, vi } from 'vitest';

// `./api` imports `@/lib/supabase`, which throws on module load when the
// VITE_SUPABASE_* env vars aren't set (Tier-1 tests run in Node, no env).
// The tests below only exercise pure helpers — stub supabase so the
// transitive import doesn't fail to load.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { exerciseDisplayName, suggestIncrementForEquipment, type Exercise } from './api';

describe('suggestIncrementForEquipment', () => {
  it('barbell → 2.5 kg', () => {
    expect(suggestIncrementForEquipment('barbell')).toBe(2.5);
  });
  it('dumbbell → 1.0 kg (per-side singles)', () => {
    expect(suggestIncrementForEquipment('dumbbell')).toBe(1.0);
  });
  it('kettlebell → 4.0 kg (fixed-weight singles)', () => {
    expect(suggestIncrementForEquipment('kettlebell')).toBe(4.0);
  });
  it('machine → 2.5 kg', () => {
    expect(suggestIncrementForEquipment('machine')).toBe(2.5);
  });
  it('cable → 2.5 kg', () => {
    expect(suggestIncrementForEquipment('cable')).toBe(2.5);
  });
  it('bodyweight → 0 (no external load)', () => {
    expect(suggestIncrementForEquipment('bodyweight')).toBe(0);
  });
  it('band → 0 (resistance is non-linear)', () => {
    expect(suggestIncrementForEquipment('band')).toBe(0);
  });
  it('other → fallback (2.5 kg)', () => {
    expect(suggestIncrementForEquipment('other')).toBe(2.5);
  });
  it('null → fallback (2.5 kg)', () => {
    expect(suggestIncrementForEquipment(null)).toBe(2.5);
  });
});

describe('exerciseDisplayName', () => {
  const base: Exercise = {
    created_at: '2026-01-01T00:00:00Z',
    created_by_user_id: null,
    default_increment_kg: 2.5,
    equipment: 'barbell',
    id: 'ex-1',
    is_verified: true,
    name_en: 'Bench press',
    name_es: 'Press de banca',
    primary_muscle: 'chest',
    secondary_muscles: [],
    source: 'system',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('returns Spanish when lang=es', () => {
    expect(exerciseDisplayName(base, 'es')).toBe('Press de banca');
  });
  it('returns English when lang=en and name_en is present', () => {
    expect(exerciseDisplayName(base, 'en')).toBe('Bench press');
  });
  it('falls back to Spanish when lang=en and name_en is null (user-contributed ES-only)', () => {
    expect(exerciseDisplayName({ ...base, name_en: null }, 'en')).toBe('Press de banca');
  });
});
