import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CoreSessionSet } from '@/core/training';

// `./loadAddedExercise` imports `../exercises/api` for `exerciseDisplayName`,
// which imports `@/lib/supabase`, which throws on module load when the
// VITE_SUPABASE_* env vars aren't set (Tier-1 tests run in Node). Stub it out
// so the transitive import doesn't fail — same pattern as exercises/api.test.ts.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import type { Exercise } from '../exercises/api';
import { loadAddedExercise, ADDED_EXERCISE_DEFAULTS } from './loadAddedExercise';

const curlRow = {
  id: 'curl', name_es: 'Curl de bíceps', name_en: 'Biceps Curl',
  default_increment_kg: 1.25, primary_muscles: ['biceps'], equipment: 'dumbbell',
} as unknown as Exercise;

function historySet(over: Partial<CoreSessionSet> = {}): CoreSessionSet {
  return {
    reps: 12, weightKg: 14, rpe: 8, isWarmup: false, setIndex: 1,
    sessionId: 's1', exerciseId: 'curl', performedOn: '2026-07-20',
    ...over,
  } as CoreSessionSet;
}

function opts(fetchHistory: () => Promise<CoreSessionSet[]>, timeoutMs?: number) {
  return {
    exercise: curlRow,
    lang: 'es' as const,
    todayISO: '2026-07-26',
    formatWeight: (kg: number) => String(kg),
    fetchHistory,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('loadAddedExercise', () => {
  it('prefills the working weight and reps from the last logged session', async () => {
    const history = [historySet(), historySet({ setIndex: 2, reps: 10 })];
    const data = await loadAddedExercise(opts(() => Promise.resolve(history)));
    expect(data.input.exerciseId).toBe('curl');
    expect(data.input.lastWorkingWeightKg).toBe(14);
    expect(data.input.workingSetPrefill).toHaveLength(ADDED_EXERCISE_DEFAULTS.targetSets);
    expect(data.input.workingSetPrefill[0]).toEqual({ reps: 12, weightKg: 14 });
    expect(data.lastTimeLabel).toBe('10 × 14 kg'); // last working set of that session
    expect(data.name).toBe('Curl de bíceps');
    expect(data.coachContext).toMatchObject({ exerciseId: 'curl', history, todayISO: '2026-07-26' });
  });

  it('applies the plan defaults regardless of history', async () => {
    const data = await loadAddedExercise(opts(() => Promise.resolve([historySet()])));
    expect(data.input).toMatchObject({
      targetSets: 3, targetRepsMin: 8, targetRepsMax: 12,
      restSeconds: null, targetRpe: null, warmupSets: [],
      defaultIncrementKg: 1.25,
    });
  });

  it('falls back to no weight when the fetch rejects', async () => {
    const data = await loadAddedExercise(opts(() => Promise.reject(new Error('offline'))));
    expect(data.input.lastWorkingWeightKg).toBeNull();
    expect(data.input.workingSetPrefill.every((p) => p.weightKg === null)).toBe(true);
    expect(data.lastTimeLabel).toBeNull();
    expect(data.coachContext.history).toEqual([]);
    expect(data.name).toBe('Curl de bíceps'); // the exercise is still added
  });

  it('falls back to no weight when the fetch never settles (timeout)', async () => {
    vi.useFakeTimers();
    const pending = loadAddedExercise(opts(() => new Promise<CoreSessionSet[]>(() => {}), 4000));
    await vi.advanceTimersByTimeAsync(4000);
    const data = await pending;
    expect(data.input.lastWorkingWeightKg).toBeNull();
    expect(data.lastTimeLabel).toBeNull();
  });

  it('falls back to no weight when the user has never done the exercise', async () => {
    const data = await loadAddedExercise(opts(() => Promise.resolve([])));
    expect(data.input.lastWorkingWeightKg).toBeNull();
    expect(data.lastTimeLabel).toBeNull();
  });

  it('uses the English name when lang is en', async () => {
    const data = await loadAddedExercise({ ...opts(() => Promise.resolve([])), lang: 'en' });
    expect(data.name).toBe('Biceps Curl');
  });

  it('falls back to a 2.5 kg increment when the catalogue row has none', async () => {
    const row = { ...curlRow, default_increment_kg: null } as unknown as Exercise;
    const data = await loadAddedExercise({ ...opts(() => Promise.resolve([])), exercise: row });
    expect(data.input.defaultIncrementKg).toBe(2.5);
    expect(data.coachContext.defaultIncrementKg).toBeNull(); // coach keeps "unset" distinct
  });
});
