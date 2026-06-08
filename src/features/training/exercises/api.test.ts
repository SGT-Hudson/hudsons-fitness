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
  CATEGORY_VALUES,
  LEVEL_VALUES,
  categorySlug,
  createExercise,
  exerciseDisplayName,
  exerciseInstructions,
  searchExercises,
  searchExercisesPaged,
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
    category: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by_user_id: null,
    default_increment_kg: 2.5,
    equipment: 'barbell',
    external_id: null,
    force: null,
    id: 'ex-1',
    images: [],
    instructions_en: [],
    instructions_es: [],
    is_verified: true,
    level: null,
    mechanic: null,
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

describe('browse filter constants', () => {
  it('exposes the 7 raw catalog categories', () => {
    expect(CATEGORY_VALUES).toEqual([
      'strength', 'stretching', 'plyometrics', 'powerlifting',
      'strongman', 'olympic weightlifting', 'cardio',
    ]);
  });
  it('exposes the 3 levels', () => {
    expect(LEVEL_VALUES).toEqual(['beginner', 'intermediate', 'expert']);
  });
  it('slugifies a category for i18n keys (space → underscore)', () => {
    expect(categorySlug('olympic weightlifting')).toBe('olympic_weightlifting');
    expect(categorySlug('strength')).toBe('strength');
  });
});

describe('exerciseInstructions', () => {
  const base: Exercise = {
    category: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by_user_id: null,
    default_increment_kg: 2.5,
    equipment: 'barbell',
    external_id: null,
    force: null,
    id: 'ex-1',
    images: [],
    instructions_en: ['Lie on the bench.', 'Press up.'],
    instructions_es: ['Túmbate en el banco.', 'Empuja hacia arriba.'],
    is_verified: true,
    level: null,
    mechanic: null,
    name_en: 'Bench press',
    name_es: 'Press de banca',
    primary_muscles: ['pec_lower'],
    secondary_muscles: [],
    source: 'free-exercise-db',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('returns Spanish steps when lang=es', () => {
    expect(exerciseInstructions(base, 'es')).toEqual([
      'Túmbate en el banco.',
      'Empuja hacia arriba.',
    ]);
  });
  it('returns English steps when lang=en and instructions_en is non-empty', () => {
    expect(exerciseInstructions(base, 'en')).toEqual(['Lie on the bench.', 'Press up.']);
  });
  it('falls back to the other language when the chosen array is empty', () => {
    expect(exerciseInstructions({ ...base, instructions_en: [] }, 'en')).toEqual([
      'Túmbate en el banco.',
      'Empuja hacia arriba.',
    ]);
  });
  it('returns [] when both arrays are empty (system/no-source rows)', () => {
    expect(
      exerciseInstructions({ ...base, instructions_en: [], instructions_es: [] }, 'es'),
    ).toEqual([]);
  });
});

function pagedBuilder(rows: unknown[], count: number) {
  const captured = {
    selectArgs: [] as unknown[][],
    eq: [] as unknown[][],
    contains: [] as unknown[][],
    overlaps: [] as unknown[][],
    or: [] as string[],
    order: [] as unknown[][],
    range: [] as number[][],
  };
  const b: Record<string, unknown> = {};
  b.select = (...a: unknown[]) => { captured.selectArgs.push(a); return b; };
  b.eq = (c: string, v: unknown) => { captured.eq.push([c, v]); return b; };
  b.contains = (c: string, v: unknown) => { captured.contains.push([c, v]); return b; };
  b.overlaps = (c: string, v: unknown) => { captured.overlaps.push([c, v]); return b; };
  b.or = (s: string) => { captured.or.push(s); return b; };
  b.order = (...a: unknown[]) => { captured.order.push(a); return b; };
  b.range = (from: number, to: number) => { captured.range.push([from, to]); return Promise.resolve({ data: rows, count, error: null }); };
  return { b, captured };
}

describe('searchExercisesPaged', () => {
  it('requests an exact count + right page window + verified-first order, returns rows + total', async () => {
    const { b, captured } = pagedBuilder([{ id: 'a' }], 42);
    from.mockReturnValue(b);
    const res = await searchExercisesPaged({
      query: '', category: null, equipment: null, level: null,
      muscleValue: '', textMuscles: [], page: 2, pageSize: 10,
    });
    expect(captured.selectArgs[0]).toEqual(['*', { count: 'exact' }]);
    expect(captured.range).toContainEqual([10, 19]); // page 2, size 10 → rows 10..19
    // pin the shared builder's ordering contract (verified first, then name_es):
    expect(captured.order[0]).toEqual(['is_verified', { ascending: false }]);
    expect(captured.order[1]).toEqual(['name_es']);
    expect(res).toEqual({ rows: [{ id: 'a' }], total: 42 });
  });

  it('applies category/equipment/level as eq filters when set', async () => {
    const { b, captured } = pagedBuilder([], 0);
    from.mockReturnValue(b);
    await searchExercisesPaged({
      query: '', category: 'strength', equipment: 'barbell', level: 'beginner',
      muscleValue: '', textMuscles: [], page: 1, pageSize: 10,
    });
    expect(captured.eq).toContainEqual(['category', 'strength']);
    expect(captured.eq).toContainEqual(['equipment', 'barbell']);
    expect(captured.eq).toContainEqual(['level', 'beginner']);
  });

  it('a single fine muscle → contains; a group: value → overlaps', async () => {
    const g = pagedBuilder([], 0);
    from.mockReturnValue(g.b);
    await searchExercisesPaged({
      query: '', category: null, equipment: null, level: null,
      muscleValue: 'group:arms', textMuscles: [], page: 1, pageSize: 10,
    });
    expect(g.captured.overlaps.length).toBe(1);
    expect(g.captured.overlaps[0][0]).toBe('primary_muscles');

    const s = pagedBuilder([], 0);
    from.mockReturnValue(s.b);
    await searchExercisesPaged({
      query: '', category: null, equipment: null, level: null,
      muscleValue: 'pec_lower', textMuscles: [], page: 1, pageSize: 10,
    });
    expect(s.captured.contains).toContainEqual(['primary_muscles', ['pec_lower']]);
  });

  it('builds the name + textMuscles OR clause from the query', async () => {
    const { b, captured } = pagedBuilder([], 0);
    from.mockReturnValue(b);
    await searchExercisesPaged({
      query: 'press', category: null, equipment: null, level: null,
      muscleValue: '', textMuscles: ['pec_lower'], page: 1, pageSize: 10,
    });
    expect(captured.or[0]).toContain('name_es.ilike.%press%');
    expect(captured.or[0]).toContain('name_en.ilike.%press%');
    expect(captured.or[0]).toContain('primary_muscles.cs.{pec_lower}');
  });
});
