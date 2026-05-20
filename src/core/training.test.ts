import { describe, it, expect } from 'vitest';
import {
  estimatedOneRepMax,
  workingSetVolume,
  bestE1rmInSets,
  e1rmTrendForExercise,
  detectPRsForExercise,
  lastWorkingSetForExercise,
  evaluateCoach,
  MVP_COACH_RULES,
  DOUBLE_PROGRESSION_DEFAULTS,
  type CoreSet,
  type CoreSessionSet,
  type CoachContext,
} from './training';

// Direct coverage of the shared pure training core (Training MVP spec
// 2026-05-20). The client and (eventual) edge wrappers delegate here; this
// asserts the core itself, including the `number | string` numeric coercion
// both runtimes rely on. Per spec §2 the core never touches kcal/TDEE.

// ── Single-set derivations ──────────────────────────────────────────────────

describe('estimatedOneRepMax', () => {
  it('Epley: w*(1 + reps/30) is the headline formula', () => {
    expect(estimatedOneRepMax(1, 100)).toBe(100 * (1 + 1 / 30));
    expect(estimatedOneRepMax(5, 100)).toBeCloseTo(100 * (1 + 5 / 30), 10);
    expect(estimatedOneRepMax(10, 100)).toBeCloseTo(100 * (1 + 10 / 30), 10);
  });

  it('Brzycki: w * 36 / (37 - reps)', () => {
    expect(estimatedOneRepMax(1, 100, 'brzycki')).toBeCloseTo(100 * 36 / 36, 10);
    expect(estimatedOneRepMax(5, 100, 'brzycki')).toBeCloseTo(100 * 36 / 32, 10);
    expect(estimatedOneRepMax(10, 100, 'brzycki')).toBeCloseTo(100 * 36 / 27, 10);
  });

  it('Brzycki returns 0 at reps >= 37 instead of Infinity', () => {
    expect(estimatedOneRepMax(37, 100, 'brzycki')).toBe(0);
    expect(estimatedOneRepMax(40, 100, 'brzycki')).toBe(0);
  });

  it('returns 0 for non-positive reps or weight', () => {
    expect(estimatedOneRepMax(0, 100)).toBe(0);
    expect(estimatedOneRepMax(5, 0)).toBe(0);
    expect(estimatedOneRepMax(-1, 100)).toBe(0);
    expect(estimatedOneRepMax(5, -1)).toBe(0);
  });

  it('returns 0 for non-finite inputs', () => {
    expect(estimatedOneRepMax(NaN, 100)).toBe(0);
    expect(estimatedOneRepMax(5, NaN)).toBe(0);
    expect(estimatedOneRepMax(Infinity, 100)).toBe(0);
  });
});

// ── Aggregations ────────────────────────────────────────────────────────────

const set = (over: Partial<CoreSet> = {}): CoreSet => ({
  reps: 8,
  weightKg: 70,
  rpe: 7,
  isWarmup: false,
  ...over,
});

describe('workingSetVolume', () => {
  it('sums reps × weight over non-warmup sets', () => {
    expect(workingSetVolume([
      set({ reps: 8, weightKg: 70 }),  // 560
      set({ reps: 5, weightKg: 100 }), // 500
    ])).toBe(1060);
  });

  it('excludes warmup sets entirely', () => {
    expect(workingSetVolume([
      set({ reps: 8, weightKg: 70, isWarmup: true }),
      set({ reps: 5, weightKg: 100 }),
    ])).toBe(500);
  });

  it('skips zero / negative / non-finite rows', () => {
    expect(workingSetVolume([
      set({ reps: 0, weightKg: 70 }),
      set({ reps: 5, weightKg: 0 }),
      set({ reps: NaN, weightKg: 70 }),
      set({ reps: 5, weightKg: 100 }),
    ])).toBe(500);
  });

  it('coerces PostgREST string numerics', () => {
    expect(workingSetVolume([
      set({ reps: '8', weightKg: '70' }),
    ])).toBe(560);
  });

  it('tolerates null / empty input', () => {
    expect(workingSetVolume([])).toBe(0);
    expect(workingSetVolume(null as unknown as CoreSet[])).toBe(0);
  });
});

describe('bestE1rmInSets', () => {
  it('returns the max non-warmup e1RM', () => {
    const result = bestE1rmInSets([
      set({ reps: 5, weightKg: 100 }),  // Epley: 116.67
      set({ reps: 1, weightKg: 110 }),  // Epley: 113.67
      set({ reps: 8, weightKg: 90 }),   // Epley: 114.00
    ]);
    expect(result).toBeCloseTo(100 * (1 + 5 / 30), 10);
  });

  it('respects formula choice', () => {
    const epley = bestE1rmInSets([set({ reps: 5, weightKg: 100 })]);
    const brzycki = bestE1rmInSets([set({ reps: 5, weightKg: 100 })], 'brzycki');
    expect(epley).not.toBe(brzycki);
    expect(brzycki).toBeCloseTo(100 * 36 / 32, 10);
  });

  it('returns null when no usable working set exists', () => {
    expect(bestE1rmInSets([])).toBeNull();
    expect(bestE1rmInSets([set({ isWarmup: true })])).toBeNull();
    expect(bestE1rmInSets([set({ reps: 0 })])).toBeNull();
  });
});

// ── History walks ───────────────────────────────────────────────────────────

const sessionSet = (over: Partial<CoreSessionSet> = {}): CoreSessionSet => ({
  sessionId: 's1',
  exerciseId: 'ex1',
  performedOn: '2026-05-01',
  setIndex: 1,
  reps: 8,
  weightKg: 70,
  rpe: 7,
  isWarmup: false,
  ...over,
});

describe('e1rmTrendForExercise', () => {
  it('emits one point per session, chronological', () => {
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's3', performedOn: '2026-05-10', reps: 5, weightKg: 110 }),
      sessionSet({ sessionId: 's1', performedOn: '2026-05-01', reps: 5, weightKg: 100 }),
      sessionSet({ sessionId: 's2', performedOn: '2026-05-05', reps: 5, weightKg: 105 }),
    ];
    const trend = e1rmTrendForExercise(history);
    expect(trend.map((p) => p.sessionId)).toEqual(['s1', 's2', 's3']);
    expect(trend[2].e1rm).toBeCloseTo(110 * (1 + 5 / 30), 10);
  });

  it('drops sessions with only warmup or invalid sets', () => {
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', performedOn: '2026-05-01', isWarmup: true }),
      sessionSet({ sessionId: 's2', performedOn: '2026-05-02', reps: 5, weightKg: 100 }),
    ];
    expect(e1rmTrendForExercise(history)).toHaveLength(1);
  });

  it('picks the BEST e1RM within a session, not the last set', () => {
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', setIndex: 1, reps: 5, weightKg: 100 }), // 116.67
      sessionSet({ sessionId: 's1', setIndex: 2, reps: 8, weightKg: 90 }),  // 114.00
    ];
    const trend = e1rmTrendForExercise(history);
    expect(trend).toHaveLength(1);
    expect(trend[0].e1rm).toBeCloseTo(100 * (1 + 5 / 30), 10);
  });
});

describe('detectPRsForExercise', () => {
  it('emits a PR whenever e1RM exceeds the running max', () => {
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', performedOn: '2026-05-01', reps: 5, weightKg: 100 }),
      sessionSet({ sessionId: 's2', performedOn: '2026-05-05', reps: 5, weightKg: 100 }), // same
      sessionSet({ sessionId: 's3', performedOn: '2026-05-10', reps: 5, weightKg: 105 }), // PR
      sessionSet({ sessionId: 's4', performedOn: '2026-05-15', reps: 5, weightKg: 102 }), // not a PR
    ];
    const prs = detectPRsForExercise(history);
    expect(prs.map((p) => p.sessionId)).toEqual(['s1', 's3']);
  });

  it('records the specific set that produced each PR', () => {
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', setIndex: 1, reps: 8, weightKg: 90 }),  // 114.00
      sessionSet({ sessionId: 's1', setIndex: 2, reps: 5, weightKg: 100 }), // 116.67 ← PR
    ];
    const prs = detectPRsForExercise(history);
    expect(prs).toHaveLength(1);
    expect(prs[0].reps).toBe(5);
    expect(prs[0].weightKg).toBe(100);
  });

  it('excludes warmup sets from PR consideration', () => {
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', reps: 5, weightKg: 200, isWarmup: true }),
      sessionSet({ sessionId: 's1', setIndex: 2, reps: 5, weightKg: 100 }),
    ];
    const prs = detectPRsForExercise(history);
    expect(prs[0].weightKg).toBe(100);
  });
});

// ── Repeat-last working set ─────────────────────────────────────────────────

describe('lastWorkingSetForExercise', () => {
  it('returns the most recent non-warmup set', () => {
    const result = lastWorkingSetForExercise([
      sessionSet({ sessionId: 's1', performedOn: '2026-05-01' }),
      sessionSet({ sessionId: 's2', performedOn: '2026-05-10' }),
    ]);
    expect(result?.sessionId).toBe('s2');
  });

  it('breaks ties on the same date by higher setIndex', () => {
    const result = lastWorkingSetForExercise([
      sessionSet({ sessionId: 's1', performedOn: '2026-05-10', setIndex: 1 }),
      sessionSet({ sessionId: 's1', performedOn: '2026-05-10', setIndex: 3 }),
      sessionSet({ sessionId: 's1', performedOn: '2026-05-10', setIndex: 2 }),
    ]);
    expect(result?.setIndex).toBe(3);
  });

  it('skips warmup sets even if they are more recent', () => {
    const result = lastWorkingSetForExercise([
      sessionSet({ sessionId: 's1', performedOn: '2026-05-01' }),
      sessionSet({ sessionId: 's2', performedOn: '2026-05-10', isWarmup: true }),
    ]);
    expect(result?.sessionId).toBe('s1');
  });

  it('returns null when the history has no usable working set', () => {
    expect(lastWorkingSetForExercise([])).toBeNull();
    expect(lastWorkingSetForExercise([sessionSet({ isWarmup: true })])).toBeNull();
    expect(lastWorkingSetForExercise([sessionSet({ reps: 0 })])).toBeNull();
  });
});

// ── Coach: rule-level tests ─────────────────────────────────────────────────

const ctx = (over: Partial<CoachContext> = {}): CoachContext => ({
  exerciseId: 'ex1',
  primaryMuscle: 'chest',
  equipment: 'barbell',
  history: [],
  todayISO: '2026-05-20',
  ...over,
});

/** Build a chain of N sessions one week apart, each with the given top working set. */
function sessions(
  n: number,
  factory: (i: number) => Partial<CoreSessionSet>,
): CoreSessionSet[] {
  const out: CoreSessionSet[] = [];
  const startMs = Date.parse('2026-04-01T00:00:00Z');
  for (let i = 0; i < n; i++) {
    const d = new Date(startMs + i * 7 * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    out.push(sessionSet({
      sessionId: `s${i + 1}`,
      performedOn: iso,
      ...factory(i),
    }));
  }
  return out;
}

describe('coach: double-progression rule', () => {
  const { sessions: N, targetReps, rpeMax, incrementByEquipment } = DOUBLE_PROGRESSION_DEFAULTS;

  it('fires when the last N sessions hit target reps at RPE ≤ rpeMax at the same weight', () => {
    const history = sessions(N, () => ({
      reps: targetReps, weightKg: 70, rpe: rpeMax,
    }));
    const out = evaluateCoach(ctx({ history, equipment: 'barbell' }));
    const hit = out.find((s) => s.ruleId === 'double-progression');
    expect(hit).toBeDefined();
    expect(hit?.detail.weightKg).toBe(70);
    expect(hit?.detail.nextWeightKg).toBe(70 + incrementByEquipment.barbell);
  });

  it('uses equipment-aware increment (dumbbell smaller bump)', () => {
    const history = sessions(N, () => ({
      reps: targetReps, weightKg: 30, rpe: rpeMax,
    }));
    const out = evaluateCoach(ctx({ history, equipment: 'dumbbell' }));
    const hit = out.find((s) => s.ruleId === 'double-progression');
    expect(hit?.detail.incrementKg).toBe(incrementByEquipment.dumbbell);
  });

  it('does not fire when the weight changed across sessions', () => {
    const history = sessions(N, (i) => ({
      reps: targetReps, weightKg: i === N - 1 ? 75 : 70, rpe: rpeMax,
    }));
    const out = evaluateCoach(ctx({ history }));
    expect(out.find((s) => s.ruleId === 'double-progression')).toBeUndefined();
  });

  it('does not fire when any session falls short of target reps', () => {
    const history = sessions(N, (i) => ({
      reps: i === 0 ? targetReps - 1 : targetReps, weightKg: 70, rpe: rpeMax,
    }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'double-progression')).toBeUndefined();
  });

  it('does not fire when any RPE exceeds rpeMax', () => {
    const history = sessions(N, (i) => ({
      reps: targetReps, weightKg: 70, rpe: i === 1 ? rpeMax + 0.5 : rpeMax,
    }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'double-progression')).toBeUndefined();
  });

  it('refuses to nudge when a set is un-rated (null RPE)', () => {
    const history = sessions(N, () => ({ reps: targetReps, weightKg: 70, rpe: null }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'double-progression')).toBeUndefined();
  });

  it('does not fire when fewer than N sessions exist', () => {
    const history = sessions(N - 1, () => ({
      reps: targetReps, weightKg: 70, rpe: rpeMax,
    }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'double-progression')).toBeUndefined();
  });

  it('does not nudge bodyweight (increment 0)', () => {
    const history = sessions(N, () => ({
      reps: targetReps, weightKg: 0.1, rpe: rpeMax,
    }));
    expect(evaluateCoach(ctx({ history, equipment: 'bodyweight' }))
      .find((s) => s.ruleId === 'double-progression')).toBeUndefined();
  });
});

describe('coach: flat-e1RM deload rule', () => {
  it('fires when e1RM stays within ±band over the flatWindow', () => {
    // 4 sessions, all 5×100 → identical e1RM
    const history = sessions(4, () => ({ reps: 5, weightKg: 100, rpe: 7 }));
    const hit = evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'flat-e1rm-deload');
    expect(hit).toBeDefined();
    expect(hit?.detail.spreadKg).toBe(0);
  });

  it('does not fire when spread exceeds the band', () => {
    const history = sessions(4, (i) => ({
      reps: 5, weightKg: 100 + i * 5, rpe: 7,
    }));
    const out = evaluateCoach(ctx({ history }));
    expect(out.find((s) => s.ruleId === 'flat-e1rm-deload')).toBeUndefined();
  });

  it('does not fire when fewer than flatWindow sessions exist', () => {
    const history = sessions(2, () => ({ reps: 5, weightKg: 100 }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'flat-e1rm-deload')).toBeUndefined();
  });
});

describe('coach: RPE-climbing fatigue rule', () => {
  it('fires when RPE strictly increases at the same load over N sessions', () => {
    const history = sessions(3, (i) => ({
      reps: 8, weightKg: 70, rpe: 8 + i, // 8, 9, 10
    }));
    const hit = evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rpe-climbing-fatigue');
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe('warn');
    expect(hit?.detail.weightKg).toBe(70);
    expect(hit?.detail.rpeFirst).toBe(8);
    expect(hit?.detail.rpeLast).toBe(10);
    expect(hit?.detail.suggestedWeightKg).toBe(70 - 7); // 10% drop = 7
  });

  it('does not fire when RPE is flat', () => {
    const history = sessions(3, () => ({ reps: 8, weightKg: 70, rpe: 8 }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rpe-climbing-fatigue')).toBeUndefined();
  });

  it('skips sessions at different weights (variation week does not reset the chain)', () => {
    // 8 @ 70 RPE 8 → 8 @ 65 RPE 7 → 8 @ 70 RPE 9 → 8 @ 70 RPE 10
    // The "at anchor weight 70" sequence is 8, 9, 10 → fires.
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', performedOn: '2026-04-01', reps: 8, weightKg: 70, rpe: 8 }),
      sessionSet({ sessionId: 's2', performedOn: '2026-04-08', reps: 8, weightKg: 65, rpe: 7 }),
      sessionSet({ sessionId: 's3', performedOn: '2026-04-15', reps: 8, weightKg: 70, rpe: 9 }),
      sessionSet({ sessionId: 's4', performedOn: '2026-04-22', reps: 8, weightKg: 70, rpe: 10 }),
    ];
    const hit = evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rpe-climbing-fatigue');
    expect(hit).toBeDefined();
  });

  it('refuses to fire when any RPE in the window is null', () => {
    const history = sessions(3, (i) => ({
      reps: 8, weightKg: 70, rpe: i === 1 ? null : 8 + i,
    }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rpe-climbing-fatigue')).toBeUndefined();
  });
});

describe('coach: muscle-recency rule', () => {
  it('fires when last session for this exercise is ≥ nudgeAfterDays ago', () => {
    const history = [sessionSet({ performedOn: '2026-05-01' })];
    const hit = evaluateCoach(ctx({ history, todayISO: '2026-05-20' }))
      .find((s) => s.ruleId === 'muscle-recency');
    expect(hit).toBeDefined();
    expect(hit?.detail.daysSince).toBe(19);
    expect(hit?.detail.primaryMuscle).toBe('chest');
  });

  it('does not fire when the last session is recent', () => {
    const history = [sessionSet({ performedOn: '2026-05-15' })];
    const out = evaluateCoach(ctx({ history, todayISO: '2026-05-20' }));
    expect(out.find((s) => s.ruleId === 'muscle-recency')).toBeUndefined();
  });

  it('uses the "never trained" headline when history is empty', () => {
    const hit = evaluateCoach(ctx({ history: [] }))
      .find((s) => s.ruleId === 'muscle-recency');
    expect(hit?.headline).toBe('coach.rules.muscleRecency.headlineNever');
  });

  it('refuses to fire when primaryMuscle is null', () => {
    const out = evaluateCoach(ctx({ history: [], primaryMuscle: null }));
    expect(out.find((s) => s.ruleId === 'muscle-recency')).toBeUndefined();
  });
});

// ── Engine ──────────────────────────────────────────────────────────────────

describe('evaluateCoach engine', () => {
  it('returns suggestions in the rule-list order (deterministic)', () => {
    // Build a history that fires both double-progression AND muscle-recency.
    const { targetReps, rpeMax } = DOUBLE_PROGRESSION_DEFAULTS;
    const old = '2026-04-01';
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', performedOn: old, reps: targetReps, weightKg: 70, rpe: rpeMax }),
      sessionSet({ sessionId: 's2', performedOn: '2026-04-08', reps: targetReps, weightKg: 70, rpe: rpeMax }),
      sessionSet({ sessionId: 's3', performedOn: '2026-04-15', reps: targetReps, weightKg: 70, rpe: rpeMax }),
    ];
    const out = evaluateCoach(ctx({ history, todayISO: '2026-05-20' }));
    const ids = out.map((s) => s.ruleId);
    // RPE-climbing won't fire (RPEs are flat at rpeMax). Double-progression
    // AND muscle-recency both fire. Engine order = MVP_COACH_RULES order.
    expect(ids).toContain('double-progression');
    expect(ids).toContain('muscle-recency');
    const dp = ids.indexOf('double-progression');
    const mr = ids.indexOf('muscle-recency');
    const dpRank = MVP_COACH_RULES.findIndex((r) => r.id === 'double-progression');
    const mrRank = MVP_COACH_RULES.findIndex((r) => r.id === 'muscle-recency');
    // Order in output mirrors order in rule list.
    expect(dp < mr).toBe(dpRank < mrRank);
  });

  it('returns [] when no rule fires (e.g. empty context, primaryMuscle null)', () => {
    expect(evaluateCoach(ctx({ history: [], primaryMuscle: null }))).toEqual([]);
  });

  it('accepts a custom rule list (extensibility test)', () => {
    const out = evaluateCoach(ctx({ history: [] }), []);
    expect(out).toEqual([]);
  });
});
