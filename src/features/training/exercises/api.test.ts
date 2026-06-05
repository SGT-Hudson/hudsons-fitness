import { describe, expect, it, vi, beforeEach } from 'vitest';

// `./api` imports `@/lib/supabase`, which throws on module load when the
// VITE_SUPABASE_* env vars aren't set (Tier-1 tests run in Node, no env).
// Stub supabase so the transitive import doesn't fail; the search/create tests
// drive `from` with a chainable builder to assert the PostgREST strings (which
// escape the typecheck — no real DB available in this tier).
const from = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => from(...a), rpc: vi.fn() },
}));

import {
  createExercise,
  exerciseDisplayName,
  searchExercises,
  suggestIncrementForEquipment,
  type Exercise,
} from './api';

beforeEach(() => {
  from.mockReset();
});

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
    primary_muscles: ['pec_lower'],
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

// These guard the two PostgREST array strings that escape the typecheck
// (`.contains('primary_muscles', [code])` and the `primary_muscles.cs.{code}`
// OR term) since the fine-taxonomy migration cannot be smoke-tested in this tier.
interface SearchBuilder {
  select: () => SearchBuilder;
  contains: (col: string, val: unknown) => SearchBuilder;
  overlaps: (col: string, val: unknown) => SearchBuilder;
  or: (s: string) => SearchBuilder;
  order: () => SearchBuilder;
  limit: () => Promise<{ data: unknown[]; error: null }>;
}

function searchBuilder() {
  const captured = {
    contains: [] as unknown[][],
    overlaps: [] as unknown[][],
    or: [] as string[],
  };
  const builder: SearchBuilder = {
    select: () => builder,
    contains: (col, val) => {
      captured.contains.push([col, val]);
      return builder;
    },
    overlaps: (col, val) => {
      captured.overlaps.push([col, val]);
      return builder;
    },
    or: (s) => {
      captured.or.push(s);
      return builder;
    },
    order: () => builder,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return { builder, captured };
}

describe('searchExercises (fine-taxonomy array operators)', () => {
  it('a dropdown muscle becomes a contains-on-array AND filter', async () => {
    const { builder, captured } = searchBuilder();
    from.mockReturnValue(builder);
    await searchExercises('', { muscle: 'pec_lower' });
    expect(captured.contains).toContainEqual(['primary_muscles', ['pec_lower']]);
  });

  it('a typed muscle adds a primary_muscles.cs.{code} OR term', async () => {
    const { builder, captured } = searchBuilder();
    from.mockReturnValue(builder);
    await searchExercises('dorsal', { textMuscles: ['lat'] });
    expect(captured.or.join('|')).toContain('primary_muscles.cs.{lat}');
  });

  it('a group filter becomes an overlaps-on-array filter', async () => {
    const { builder, captured } = searchBuilder();
    from.mockReturnValue(builder);
    await searchExercises('', { groupMuscles: ['delt_front', 'delt_side', 'delt_rear'] });
    expect(captured.overlaps).toContainEqual([
      'primary_muscles',
      ['delt_front', 'delt_side', 'delt_rear'],
    ]);
  });

  it('no group filter issues no overlaps call', async () => {
    const { builder, captured } = searchBuilder();
    from.mockReturnValue(builder);
    await searchExercises('', {});
    expect(captured.overlaps).toEqual([]);
  });
});

describe('createExercise', () => {
  it('carries primary_muscles[] into the insert payload', async () => {
    let insertArg: { primary_muscles?: unknown; secondary_muscles?: unknown } | undefined;
    from.mockReturnValue({
      insert: (payload: { primary_muscles?: unknown; secondary_muscles?: unknown }) => {
        insertArg = payload;
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'x' }, error: null }) }) };
      },
    });
    await createExercise('user-1', {
      name_es: 'Test',
      name_en: null,
      primary_muscles: ['pec_lower'],
      secondary_muscles: ['delt_front'],
      equipment: 'barbell',
      default_increment_kg: 2.5,
    });
    expect(insertArg?.primary_muscles).toEqual(['pec_lower']);
    expect(insertArg?.secondary_muscles).toEqual(['delt_front']);
  });
});
