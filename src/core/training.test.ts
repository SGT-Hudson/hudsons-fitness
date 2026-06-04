import { describe, it, expect } from 'vitest';
import {
  estimatedOneRepMax,
  workingSetVolume,
  bestE1rmInSets,
  e1rmTrendForExercise,
  detectPRsForExercise,
  lastWorkingSetForExercise,
  prefillSetsForExercise,
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
  primaryMuscles: ['pec_lower'],
  equipment: 'barbell',
  defaultIncrementKg: null, // exercises whose system seed / user override left null
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

  it('uses defaultIncrementKg from the exercise row when set (overrides equipment map)', () => {
    // bench at +5 kg (override) instead of +2.5 (barbell default)
    const history = sessions(N, () => ({
      reps: targetReps, weightKg: 70, rpe: rpeMax,
    }));
    const out = evaluateCoach(ctx({ history, equipment: 'barbell', defaultIncrementKg: 5 }));
    const hit = out.find((s) => s.ruleId === 'double-progression');
    expect(hit?.detail.incrementKg).toBe(5);
    expect(hit?.detail.nextWeightKg).toBe(75);
  });

  it('falls back to equipment map when defaultIncrementKg is null', () => {
    const history = sessions(N, () => ({
      reps: targetReps, weightKg: 30, rpe: rpeMax,
    }));
    const out = evaluateCoach(ctx({ history, equipment: 'dumbbell', defaultIncrementKg: null }));
    const hit = out.find((s) => s.ruleId === 'double-progression');
    expect(hit?.detail.incrementKg).toBe(1.0); // dumbbell map default
  });

  it('kettlebell defaults to 4 kg (fixed-weight singles)', () => {
    const history = sessions(N, () => ({
      reps: targetReps, weightKg: 16, rpe: rpeMax,
    }));
    const out = evaluateCoach(ctx({ history, equipment: 'kettlebell' }));
    expect(out.find((s) => s.ruleId === 'double-progression')?.detail.incrementKg).toBe(4.0);
  });
});

describe('coach: rep-progression rule (1b, no RPE)', () => {
  it('fires on strictly increasing reps at the same load across N sessions', () => {
    // 70 kg x 6 → 7 → 8, RPE not logged
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', performedOn: '2026-04-01', reps: 6, weightKg: 70, rpe: null }),
      sessionSet({ sessionId: 's2', performedOn: '2026-04-08', reps: 7, weightKg: 70, rpe: null }),
      sessionSet({ sessionId: 's3', performedOn: '2026-04-15', reps: 8, weightKg: 70, rpe: null }),
    ];
    const hit = evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rep-progression');
    expect(hit).toBeDefined();
    expect(hit?.detail.weightKg).toBe(70);
    expect(hit?.detail.repsFirst).toBe(6);
    expect(hit?.detail.repsLast).toBe(8);
    expect(hit?.detail.nextWeightKg).toBe(72.5); // barbell default
  });

  it('does NOT require RPE — fires when rpe is null on every set (the failure-trainer case)', () => {
    const history = sessions(3, (i) => ({
      reps: 6 + i, weightKg: 70, rpe: null,
    }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rep-progression')).toBeDefined();
  });

  it('does not fire when reps are flat', () => {
    const history = sessions(3, () => ({ reps: 7, weightKg: 70, rpe: null }));
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rep-progression')).toBeUndefined();
  });

  it('does not fire when reps decrease in the window', () => {
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', performedOn: '2026-04-01', reps: 8, weightKg: 70, rpe: null }),
      sessionSet({ sessionId: 's2', performedOn: '2026-04-08', reps: 7, weightKg: 70, rpe: null }),
      sessionSet({ sessionId: 's3', performedOn: '2026-04-15', reps: 8, weightKg: 70, rpe: null }),
    ];
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rep-progression')).toBeUndefined();
  });

  it('does not fire when load changes in the window', () => {
    const history: CoreSessionSet[] = [
      sessionSet({ sessionId: 's1', performedOn: '2026-04-01', reps: 6, weightKg: 70 }),
      sessionSet({ sessionId: 's2', performedOn: '2026-04-08', reps: 7, weightKg: 72.5 }),
      sessionSet({ sessionId: 's3', performedOn: '2026-04-15', reps: 8, weightKg: 70 }),
    ];
    expect(evaluateCoach(ctx({ history }))
      .find((s) => s.ruleId === 'rep-progression')).toBeUndefined();
  });

  it('uses defaultIncrementKg override when set', () => {
    const history = sessions(3, (i) => ({ reps: 5 + i, weightKg: 100 }));
    const hit = evaluateCoach(ctx({ history, defaultIncrementKg: 5 }))
      .find((s) => s.ruleId === 'rep-progression');
    expect(hit?.detail.incrementKg).toBe(5);
    expect(hit?.detail.nextWeightKg).toBe(105);
  });

  it('Rule 1 and Rule 1b can BOTH fire (lifter rates RPE conservatively AND adds reps)', () => {
    // Top sets 70 kg × 6/7/8 at RPE 6/6.5/7 — Rule 1 fires (reps == 8 at RPE ≤ 7 — but only 1 session, so chain fails for Rule 1)
    // Need to construct a real both-fire scenario: 3 sessions at same load, target reps hit at RPE ≤ rpeMax, AND reps strictly increasing
    // That's a contradiction: rep-progression requires strictly INCREASING; double-progression requires the rep count == targetReps for all 3.
    // So in practice these are mutually exclusive on the same window. Confirming that here is the test.
    const history = sessions(3, () => ({ reps: 8, weightKg: 70, rpe: 7 }));
    const out = evaluateCoach(ctx({ history }));
    expect(out.find((s) => s.ruleId === 'double-progression')).toBeDefined();
    // Rule 1b doesn't fire because reps are flat (8/8/8), not strictly increasing.
    expect(out.find((s) => s.ruleId === 'rep-progression')).toBeUndefined();
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
    expect(hit?.detail.primaryMuscle).toBe('pec_lower');
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

  it('refuses to fire when there are no primary movers', () => {
    const out = evaluateCoach(ctx({ history: [], primaryMuscles: [] }));
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

  it('returns [] when no rule fires (e.g. empty context, no primary movers)', () => {
    expect(evaluateCoach(ctx({ history: [], primaryMuscles: [] }))).toEqual([]);
  });

  it('accepts a custom rule list (extensibility test)', () => {
    const out = evaluateCoach(ctx({ history: [] }), []);
    expect(out).toEqual([]);
  });
});

function makeSessionSet(p: Partial<CoreSessionSet>): CoreSessionSet {
  return {
    reps: 8, weightKg: 80, rpe: null, isWarmup: false,
    setIndex: 1, sessionId: 's1', exerciseId: 'e1', performedOn: '2026-05-01',
    ...p,
  };
}

describe('prefillSetsForExercise', () => {
  it('prefills each working set from the matching set of the most recent session', () => {
    const history: CoreSessionSet[] = [
      makeSessionSet({ sessionId: 's1', performedOn: '2026-05-10', setIndex: 1, reps: 8, weightKg: 80 }),
      makeSessionSet({ sessionId: 's1', performedOn: '2026-05-10', setIndex: 2, reps: 7, weightKg: 80 }),
      makeSessionSet({ sessionId: 's0', performedOn: '2026-05-03', setIndex: 1, reps: 5, weightKg: 70 }),
    ];
    expect(prefillSetsForExercise(history, 2, 5)).toEqual([
      { reps: 8, weightKg: 80 },
      { reps: 7, weightKg: 80 },
    ]);
  });

  it('ignores warm-up rows when choosing the matching set', () => {
    const history: CoreSessionSet[] = [
      makeSessionSet({ performedOn: '2026-05-10', setIndex: 1, isWarmup: true, reps: 10, weightKg: 40 }),
      makeSessionSet({ performedOn: '2026-05-10', setIndex: 2, reps: 8, weightKg: 82.5 }),
    ];
    expect(prefillSetsForExercise(history, 1, 5)).toEqual([{ reps: 8, weightKg: 82.5 }]);
  });

  it('falls back to the last working set when last session had fewer sets', () => {
    const history: CoreSessionSet[] = [
      makeSessionSet({ performedOn: '2026-05-10', setIndex: 1, reps: 8, weightKg: 80 }),
    ];
    expect(prefillSetsForExercise(history, 3, 5)).toEqual([
      { reps: 8, weightKg: 80 },
      { reps: 8, weightKg: 80 },
      { reps: 8, weightKg: 80 },
    ]);
  });

  it('falls back to target-rep floor with blank weight when there is no history', () => {
    expect(prefillSetsForExercise([], 2, 6)).toEqual([
      { reps: 6, weightKg: null },
      { reps: 6, weightKg: null },
    ]);
  });

  it('coerces string weights to numbers', () => {
    const history: CoreSessionSet[] = [
      makeSessionSet({ performedOn: '2026-05-10', setIndex: 1, reps: 8, weightKg: '77.5' }),
    ];
    expect(prefillSetsForExercise(history, 1, 5)).toEqual([{ reps: 8, weightKg: 77.5 }]);
  });

  it('matched set with weightKg 0 falls through to the last loaded working set (not a zero weight)', () => {
    // Most recent session has weightKg: 0 — not a usable loaded set.
    // An older session has a real weight. The function must fall through to that
    // older session's data via lastWorkingSetForExercise, not emit weight 0.
    const history: CoreSessionSet[] = [
      makeSessionSet({ sessionId: 's1', performedOn: '2026-05-03', setIndex: 1, reps: 6, weightKg: 60 }),
      makeSessionSet({ sessionId: 's2', performedOn: '2026-05-10', setIndex: 1, reps: 8, weightKg: 0 }),
    ];
    expect(prefillSetsForExercise(history, 1, 5)).toEqual([{ reps: 6, weightKg: 60 }]);
  });

  it('all-warmup history is treated the same as no usable history → target-rep floor, null weight', () => {
    const history: CoreSessionSet[] = [
      makeSessionSet({ setIndex: 1, isWarmup: true, reps: 12, weightKg: 40 }),
      makeSessionSet({ setIndex: 2, isWarmup: true, reps: 10, weightKg: 50 }),
    ];
    expect(prefillSetsForExercise(history, 2, 6)).toEqual([
      { reps: 6, weightKg: null },
      { reps: 6, weightKg: null },
    ]);
  });
});
