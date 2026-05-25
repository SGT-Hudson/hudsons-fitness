// Shared pure training core (Training MVP, spec 2026-05-20).
//
// ONE dependency-free, runtime-agnostic, camelCase implementation of every
// derived metric and coach rule the Training MVP renders. It uses ONLY
// standard JS/TS (no React, no `@/` alias, no Node/Deno-only globals, no
// clock, no IO). Both runtimes import it directly with no transpile/codegen:
//   - the client via `@/core/training` (Vite alias / tsc paths),
//   - the edge (when it eventually needs training data) via a relative path
//     from `supabase/functions/_shared/`.
//
// camelCase is deliberate (D-C4): snake_case is reserved for DB-sourced rows.
// Numeric inputs accept `number | string` because PostgREST returns numeric
// columns as strings; `Number()` coercion here means both runtimes get
// identical results from the same row shape (the R-16 golden-vector parity
// net asserts this).
//
// Architectural guardrail (spec §2): NOTHING here reads or returns kcal,
// and NOTHING here is allowed to be wired into the TDEE/targets path. The
// training core is presentational, derived-only (invariant #5), and isolated
// from the body-comp/nutrition core.

export type Numeric = number | string;
export type E1rmFormula = 'epley' | 'brzycki';

/** A single logged set in its minimum-information form. */
export interface CoreSet {
  reps: Numeric;
  weightKg: Numeric;
  rpe: Numeric | null;
  isWarmup: boolean;
}

/**
 * A logged set carrying enough provenance to walk a per-exercise history.
 * `performedOn` is an ISO date (YYYY-MM-DD), `setIndex` is 1-based within
 * (session, exercise) — the caller pre-filters/sorts as appropriate; this
 * core does not look up rows itself.
 */
export interface CoreSessionSet extends CoreSet {
  sessionId: string;
  exerciseId: string;
  performedOn: string;
  setIndex: number;
}

// ── Numeric helpers ─────────────────────────────────────────────────────────

/** Coerce PostgREST-style `Numeric` into a finite JS number, or `NaN`. */
function num(n: Numeric): number {
  return Number(n);
}

/** True only for genuinely usable reps × kg pairs (>0 on both). */
function isLoadedSet(set: CoreSet): boolean {
  const r = num(set.reps);
  const w = num(set.weightKg);
  return Number.isFinite(r) && Number.isFinite(w) && r > 0 && w > 0;
}

// ── Estimated 1-rep max (spec §5) ───────────────────────────────────────────

/**
 * Estimated 1RM. Epley (`w · (1 + reps/30)`) is the headline; Brzycki
 * (`w · 36 / (37 − reps)`) is exposed for parity with Fitbod. Both grow
 * unreliable past ~10 reps — the UI flags that, the math does not hide it.
 *
 *  - reps ≤ 0 or weight ≤ 0 → 0 (consistent with `macros.ingredientMacros`).
 *  - Brzycki at reps ≥ 37 → 0 (denominator vanishes; report nothing rather
 *    than `Infinity`).
 *  - Non-finite inputs → 0.
 */
export function estimatedOneRepMax(
  reps: number,
  weightKg: number,
  formula: E1rmFormula = 'epley',
): number {
  if (!Number.isFinite(reps) || !Number.isFinite(weightKg)) return 0;
  if (reps <= 0 || weightKg <= 0) return 0;
  if (formula === 'brzycki') {
    if (reps >= 37) return 0;
    return weightKg * 36 / (37 - reps);
  }
  return weightKg * (1 + reps / 30);
}

// ── Aggregations over a set list ────────────────────────────────────────────

/** Σ reps · weight over non-warmup sets. Skips invalid/zero rows silently. */
export function workingSetVolume(sets: CoreSet[]): number {
  let total = 0;
  for (const s of sets ?? []) {
    if (s.isWarmup) continue;
    if (!isLoadedSet(s)) continue;
    total += num(s.reps) * num(s.weightKg);
  }
  return total;
}

/**
 * Best e1RM among the non-warmup sets in this list. Returns `null` when no
 * usable working set exists — the UI shows "—" rather than fabricating 0.
 */
export function bestE1rmInSets(
  sets: CoreSet[],
  formula: E1rmFormula = 'epley',
): number | null {
  let best: number | null = null;
  for (const s of sets ?? []) {
    if (s.isWarmup) continue;
    if (!isLoadedSet(s)) continue;
    const e = estimatedOneRepMax(num(s.reps), num(s.weightKg), formula);
    if (e > 0 && (best === null || e > best)) best = e;
  }
  return best;
}

// ── History walks (spec §5) ─────────────────────────────────────────────────

export interface E1rmTrendPoint {
  performedOn: string;
  sessionId: string;
  e1rm: number;
}

/**
 * One trend point per session: the best non-warmup e1RM that session for
 * the given history. The caller is expected to pass already-filtered sets
 * for a single exercise; sessions with no usable working set are dropped.
 * Output is sorted ascending by `performedOn` (ties broken by `sessionId`)
 * so chart code can rely on chronological order.
 */
export function e1rmTrendForExercise(
  history: CoreSessionSet[],
  formula: E1rmFormula = 'epley',
): E1rmTrendPoint[] {
  const bySession = new Map<string, { performedOn: string; sets: CoreSessionSet[] }>();
  for (const s of history ?? []) {
    if (s.isWarmup) continue;
    let row = bySession.get(s.sessionId);
    if (!row) {
      row = { performedOn: s.performedOn, sets: [] };
      bySession.set(s.sessionId, row);
    }
    row.sets.push(s);
  }
  const points: E1rmTrendPoint[] = [];
  for (const [sessionId, { performedOn, sets }] of bySession) {
    const best = bestE1rmInSets(sets, formula);
    if (best !== null) points.push({ performedOn, sessionId, e1rm: best });
  }
  points.sort((a, b) => {
    if (a.performedOn !== b.performedOn) {
      return a.performedOn < b.performedOn ? -1 : 1;
    }
    return a.sessionId < b.sessionId ? -1 : 1;
  });
  return points;
}

export interface PRPoint {
  performedOn: string;
  sessionId: string;
  e1rm: number;
  reps: number;
  weightKg: number;
}

/**
 * Monotonically-increasing e1RM milestones. Walks `e1rmTrendForExercise`
 * output chronologically; emits a `PRPoint` every time e1RM exceeds the
 * running max. The reps/weightKg recorded are the *specific working set*
 * that produced the new best e1RM in that session.
 */
export function detectPRsForExercise(
  history: CoreSessionSet[],
  formula: E1rmFormula = 'epley',
): PRPoint[] {
  // Group sets by session, walk in chronological order.
  const bySession = new Map<string, { performedOn: string; sets: CoreSessionSet[] }>();
  for (const s of history ?? []) {
    if (s.isWarmup) continue;
    let row = bySession.get(s.sessionId);
    if (!row) {
      row = { performedOn: s.performedOn, sets: [] };
      bySession.set(s.sessionId, row);
    }
    row.sets.push(s);
  }
  const ordered = [...bySession.entries()].sort(([aId, a], [bId, b]) => {
    if (a.performedOn !== b.performedOn) {
      return a.performedOn < b.performedOn ? -1 : 1;
    }
    return aId < bId ? -1 : 1;
  });

  const prs: PRPoint[] = [];
  let runningMax = 0;
  for (const [sessionId, { performedOn, sets }] of ordered) {
    let bestE = 0;
    let bestSet: CoreSessionSet | null = null;
    for (const s of sets) {
      if (!isLoadedSet(s)) continue;
      const e = estimatedOneRepMax(num(s.reps), num(s.weightKg), formula);
      if (e > bestE) {
        bestE = e;
        bestSet = s;
      }
    }
    if (bestSet && bestE > runningMax) {
      runningMax = bestE;
      prs.push({
        performedOn,
        sessionId,
        e1rm: bestE,
        reps: num(bestSet.reps),
        weightKg: num(bestSet.weightKg),
      });
    }
  }
  return prs;
}

// ── Repeat-last working set (spec §6) ───────────────────────────────────────

/**
 * The most recent non-warmup set across the caller-provided history (which
 * should already be filtered to the one exercise the user just picked).
 * Returns `null` if there is none — the UI then shows no placeholder.
 *
 * "Most recent" = latest `performedOn`; ties broken by larger `setIndex`
 * (the user's last working set within that session), then by `sessionId`
 * for total determinism.
 */
export function lastWorkingSetForExercise(
  history: CoreSessionSet[],
): CoreSessionSet | null {
  let best: CoreSessionSet | null = null;
  for (const s of history ?? []) {
    if (s.isWarmup) continue;
    if (!isLoadedSet(s)) continue;
    if (best === null) {
      best = s;
      continue;
    }
    if (s.performedOn > best.performedOn) {
      best = s;
    } else if (s.performedOn === best.performedOn) {
      if (s.setIndex > best.setIndex) {
        best = s;
      } else if (s.setIndex === best.setIndex && s.sessionId > best.sessionId) {
        best = s;
      }
    }
  }
  return best;
}

export interface WorkingSetPrefill {
  reps: number;
  weightKg: number | null;
}

/**
 * Per-set prefill for a routine's working sets (spec §4.2). For each working
 * set index, prefill from the matching working set of the user's MOST RECENT
 * session of this exercise. Fallbacks: fewer sets last time → the last working
 * set; no history → target-rep floor with a blank weight. Warm-up rows are
 * ignored. Pure; the caller supplies the exercise's history.
 */
export function prefillSetsForExercise(
  history: CoreSessionSet[],
  targetSets: number,
  targetRepsMin: number,
): WorkingSetPrefill[] {
  const working = (history ?? []).filter((s) => !s.isWarmup);

  // Identify the most recent session (latest performedOn, tie-broken by
  // sessionId) and gather its working sets ordered by setIndex.
  let recentKey: { performedOn: string; sessionId: string } | null = null;
  for (const s of working) {
    if (
      recentKey === null ||
      s.performedOn > recentKey.performedOn ||
      (s.performedOn === recentKey.performedOn && s.sessionId > recentKey.sessionId)
    ) {
      recentKey = { performedOn: s.performedOn, sessionId: s.sessionId };
    }
  }
  const recentSets = recentKey
    ? working
        .filter((s) => s.sessionId === recentKey!.sessionId)
        .slice()
        .sort((a, b) => a.setIndex - b.setIndex)
    : [];

  const last = lastWorkingSetForExercise(history);

  const out: WorkingSetPrefill[] = [];
  for (let i = 0; i < targetSets; i += 1) {
    const match = recentSets[i];
    if (match) {
      out.push({ reps: match.reps, weightKg: Number(match.weightKg) });
    } else if (last) {
      out.push({ reps: last.reps, weightKg: Number(last.weightKg) });
    } else {
      out.push({ reps: targetRepsMin, weightKg: null });
    }
  }
  return out;
}

// ── Rule-based coach (spec §7) ──────────────────────────────────────────────
//
// Every rule is a pure function over a `CoachContext` that the caller pre-
// assembles (history for the picked exercise, today's ISO date, etc.). No
// rule reads a clock or talks to the DB. Suggestions are i18n keys + a
// `detail` blob the UI renders; the core never emits raw user-facing
// strings.

export interface CoachContext {
  exerciseId: string;
  primaryMuscle: string | null;
  equipment: string | null;
  /**
   * Per-exercise load increment from `exercises.default_increment_kg`
   * (spec §4.1). `null` falls back to the equipment-derived map below
   * (`DOUBLE_PROGRESSION_DEFAULTS.incrementByEquipment`). Used by both
   * Rule 1 (double-progression) and Rule 1b (rep-progression).
   */
  defaultIncrementKg: number | null;
  /** All of this user's logged sets for THIS exercise, any session, any order. */
  history: CoreSessionSet[];
  /** Caller supplies "today" — keeps the core deterministic and clock-free. */
  todayISO: string;
}

export type CoachSeverity = 'info' | 'nudge' | 'warn';

export interface CoachSuggestion {
  ruleId: string;
  severity: CoachSeverity;
  /** i18n key under `coach.rules.<ruleId>.headline`. */
  headline: string;
  /** Template params the UI substitutes into the localised headline. */
  detail: Record<string, string | number>;
}

export interface CoachRule {
  id: string;
  evaluate(ctx: CoachContext): CoachSuggestion | null;
}

// ── MVP rule defaults (spec §7.1 / §12.2: "first guesses, tune at plan time")

/** Double-progression (RPE-gated): hit target reps at RPE ≤ rpeMax this many sessions in a row → bump load. */
export const DOUBLE_PROGRESSION_DEFAULTS = {
  sessions: 3,
  targetReps: 8,
  rpeMax: 7,
  /**
   * Equipment-aware FALLBACK increment (kg) — used only when the
   * exercise's `default_increment_kg` is null (spec §4.1). Per
   * 2026-05-20 decision the per-exercise column is the primary source.
   * Vocab: barbell/dumbbell/kettlebell/machine/cable/bodyweight/band/other.
   */
  incrementByEquipment: {
    barbell: 2.5,
    dumbbell: 1.0,
    kettlebell: 4.0, // KBs come in fixed-weight singles (8/12/16/20/24/28/32 kg standard)
    machine: 2.5,
    cable: 2.5, // covers pulley exercises (§0.13)
    bodyweight: 0,
    band: 0,
    other: 2.5,
  } as Record<string, number>,
  fallbackIncrementKg: 2.5,
} as const;

/** Rep-progression (no RPE): same load, strictly increasing top-set reps across N sessions → bump load. */
export const REP_PROGRESSION_DEFAULTS = {
  sessions: 3,
} as const;

/** Flat e1RM: trend kg-spread within ±band over flatWindow sessions → suggest deload. */
export const FLAT_E1RM_DEFAULTS = {
  flatWindow: 4,
  flatBandKg: 1,
} as const;

/** RPE-climbing fatigue: strictly increasing RPE at the same exact load across N sessions. */
export const RPE_CLIMBING_DEFAULTS = {
  sessions: 3,
  /** Drop-load suggestion fraction (0.10 = 10%). */
  dropLoadFraction: 0.10,
} as const;

/** Days-since-muscle-group nudge threshold. */
export const MUSCLE_RECENCY_DEFAULTS = {
  nudgeAfterDays: 10,
} as const;

// ── Date arithmetic (no clock; pure on ISO strings) ─────────────────────────

/** Whole calendar-day diff between two YYYY-MM-DD strings (a − b). */
function isoDayDiff(aISO: string, bISO: string): number {
  const a = Date.parse(aISO + 'T00:00:00Z');
  const b = Date.parse(bISO + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

// ── Internal helpers shared by the rules ────────────────────────────────────

/**
 * Per-session "top working set" (highest weight × reps product, with
 * weight as the primary key to bias toward heaviest sets — the same intent
 * Hevy uses for "top set"). Returned in chronological order, oldest first.
 */
function topWorkingSetsByDate(history: CoreSessionSet[]): Array<{
  performedOn: string;
  sessionId: string;
  set: CoreSessionSet;
}> {
  const bySession = new Map<string, CoreSessionSet[]>();
  for (const s of history ?? []) {
    if (s.isWarmup) continue;
    if (!isLoadedSet(s)) continue;
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  const rows: Array<{ performedOn: string; sessionId: string; set: CoreSessionSet }> = [];
  for (const [sessionId, sets] of bySession) {
    let top: CoreSessionSet | null = null;
    for (const s of sets) {
      if (
        top === null ||
        num(s.weightKg) > num(top.weightKg) ||
        (num(s.weightKg) === num(top.weightKg) && num(s.reps) > num(top.reps))
      ) {
        top = s;
      }
    }
    if (top) rows.push({ performedOn: top.performedOn, sessionId, set: top });
  }
  rows.sort((a, b) => {
    if (a.performedOn !== b.performedOn) {
      return a.performedOn < b.performedOn ? -1 : 1;
    }
    return a.sessionId < b.sessionId ? -1 : 1;
  });
  return rows;
}

// ── Increment resolution (shared by Rule 1 + Rule 1b) ──────────────────────

/**
 * Resolve the load increment for a progression suggestion. Per spec §4.1
 * + §0.14: the per-exercise `default_increment_kg` is the primary source;
 * if null (e.g. user-contributed exercises that didn't override), fall
 * back to the equipment-derived map; if that map yields 0 or undefined
 * (bodyweight, band), return 0 so the caller can decline to suggest.
 */
function resolveIncrementKg(ctx: CoachContext): number {
  if (ctx.defaultIncrementKg !== null && ctx.defaultIncrementKg > 0) {
    return ctx.defaultIncrementKg;
  }
  const map = DOUBLE_PROGRESSION_DEFAULTS.incrementByEquipment;
  if (ctx.equipment !== null && map[ctx.equipment] !== undefined) {
    return map[ctx.equipment];
  }
  return DOUBLE_PROGRESSION_DEFAULTS.fallbackIncrementKg;
}

// ── Rule 1: double progression (RPE-gated) ─────────────────────────────────

const ruleDoubleProgression: CoachRule = {
  id: 'double-progression',
  evaluate(ctx) {
    const { sessions, targetReps, rpeMax } = DOUBLE_PROGRESSION_DEFAULTS;
    const tops = topWorkingSetsByDate(ctx.history);
    if (tops.length < sessions) return null;

    const window = tops.slice(-sessions); // latest N sessions
    const w0 = num(window[0].set.weightKg);
    for (const row of window) {
      const s = row.set;
      if (num(s.weightKg) !== w0) return null;
      if (num(s.reps) < targetReps) return null;
      // Nullable RPE: if the user didn't rate the set, we can't conclude
      // "RPE ≤ rpeMax" — refuse to nudge rather than guess.
      if (s.rpe === null) return null;
      if (num(s.rpe) > rpeMax) return null;
    }

    const inc = resolveIncrementKg(ctx);
    if (inc <= 0) return null; // bodyweight / band: nothing to suggest here

    return {
      ruleId: 'double-progression',
      severity: 'nudge',
      headline: 'coach.rules.doubleProgression.headline',
      detail: {
        sessions,
        targetReps,
        rpeMax,
        weightKg: w0,
        nextWeightKg: w0 + inc,
        incrementKg: inc,
      },
    };
  },
};

// ── Rule 1b: rep-progression (no RPE) ──────────────────────────────────────
//
// Serves failure-style training and anyone who doesn't log RPE. Same load,
// strictly increasing top-set reps over N consecutive sessions → suggest
// the next load. Doesn't read RPE; fires regardless of whether sets are
// rated. The signal is the rep INCREASE itself ("you're earning more reps
// at this load — you have more in the tank"). Spec §7.1 Rule 1b.

const ruleRepProgression: CoachRule = {
  id: 'rep-progression',
  evaluate(ctx) {
    const { sessions } = REP_PROGRESSION_DEFAULTS;
    const tops = topWorkingSetsByDate(ctx.history);
    if (tops.length < sessions) return null;

    const window = tops.slice(-sessions); // latest N sessions
    const w0 = num(window[0].set.weightKg);
    let prevReps = 0;
    for (const row of window) {
      const s = row.set;
      if (num(s.weightKg) !== w0) return null; // load changed → no rep chain
      const r = num(s.reps);
      if (prevReps !== 0 && !(r > prevReps)) return null; // not strictly increasing
      prevReps = r;
    }

    const inc = resolveIncrementKg(ctx);
    if (inc <= 0) return null;

    return {
      ruleId: 'rep-progression',
      severity: 'nudge',
      headline: 'coach.rules.repProgression.headline',
      detail: {
        sessions,
        weightKg: w0,
        repsFirst: num(window[0].set.reps),
        repsLast: num(window[window.length - 1].set.reps),
        nextWeightKg: w0 + inc,
        incrementKg: inc,
      },
    };
  },
};

// ── Rule 2: flat e1RM → deload nudge ────────────────────────────────────────

const ruleFlatE1rmDeload: CoachRule = {
  id: 'flat-e1rm-deload',
  evaluate(ctx) {
    const { flatWindow, flatBandKg } = FLAT_E1RM_DEFAULTS;
    const trend = e1rmTrendForExercise(ctx.history);
    if (trend.length < flatWindow) return null;
    const window = trend.slice(-flatWindow);
    const values = window.map((p) => p.e1rm);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max - min > flatBandKg) return null;
    return {
      ruleId: 'flat-e1rm-deload',
      severity: 'nudge',
      headline: 'coach.rules.flatE1rmDeload.headline',
      detail: {
        sessions: flatWindow,
        spreadKg: max - min,
        bandKg: flatBandKg,
        latestE1rm: values[values.length - 1],
      },
    };
  },
};

// ── Rule 3: RPE-climbing fatigue ────────────────────────────────────────────

const ruleRpeClimbingFatigue: CoachRule = {
  id: 'rpe-climbing-fatigue',
  evaluate(ctx) {
    const { sessions, dropLoadFraction } = RPE_CLIMBING_DEFAULTS;
    // Find top sets, but skip sessions that don't contain a working set at
    // the comparison weight — a "variation week" shouldn't reset the chain.
    const tops = topWorkingSetsByDate(ctx.history);
    if (tops.length < sessions) return null;
    // Anchor weight is the most recent top set's weight.
    const anchorWeight = num(tops[tops.length - 1].set.weightKg);
    const atAnchor = tops.filter((t) => num(t.set.weightKg) === anchorWeight);
    if (atAnchor.length < sessions) return null;
    const window = atAnchor.slice(-sessions);
    let prev: number | null = null;
    for (const row of window) {
      const r = row.set.rpe;
      if (r === null) return null; // un-rated set: can't conclude a trend
      const rn = num(r);
      if (prev !== null && !(rn > prev)) return null;
      prev = rn;
    }
    const droppedKg = Math.round(anchorWeight * dropLoadFraction * 10) / 10;
    return {
      ruleId: 'rpe-climbing-fatigue',
      severity: 'warn',
      headline: 'coach.rules.rpeClimbingFatigue.headline',
      detail: {
        sessions,
        weightKg: anchorWeight,
        rpeFirst: num(window[0].set.rpe as Numeric),
        rpeLast: num(window[window.length - 1].set.rpe as Numeric),
        dropLoadFraction,
        suggestedWeightKg: anchorWeight - droppedKg,
      },
    };
  },
};

// ── Rule 4: days since muscle group ─────────────────────────────────────────
//
// This rule reads about the muscle group, not the specific exercise. The
// caller is responsible for assembling `history` from ALL exercises sharing
// `ctx.primaryMuscle` if they want this rule to fire on a per-muscle basis.
// When `history` is the single-exercise slice (the default elsewhere), this
// rule simply tells you when you last did THIS exercise.

const ruleMuscleRecency: CoachRule = {
  id: 'muscle-recency',
  evaluate(ctx): CoachSuggestion | null {
    const { nudgeAfterDays } = MUSCLE_RECENCY_DEFAULTS;
    if (ctx.primaryMuscle === null) return null;
    if (!ctx.history?.length) {
      // Never trained: that's a stronger nudge than days-since.
      const never: CoachSuggestion = {
        ruleId: 'muscle-recency',
        severity: 'info',
        headline: 'coach.rules.muscleRecency.headlineNever',
        detail: { primaryMuscle: ctx.primaryMuscle },
      };
      return never;
    }
    let latest = '';
    for (const s of ctx.history) {
      if (s.performedOn > latest) latest = s.performedOn;
    }
    if (!latest) return null;
    const days = isoDayDiff(ctx.todayISO, latest);
    if (days < nudgeAfterDays) return null;
    const hit: CoachSuggestion = {
      ruleId: 'muscle-recency',
      severity: 'info',
      headline: 'coach.rules.muscleRecency.headline',
      detail: {
        primaryMuscle: ctx.primaryMuscle,
        daysSince: days,
        nudgeAfterDays,
      },
    };
    return hit;
  },
};

// ── Engine ──────────────────────────────────────────────────────────────────

/** The five MVP rules in priority order (highest-signal first).
 *  Rule 1 (RPE-gated) and Rule 1b (rep-progression) are deliberate
 *  alternatives serving different lifter styles; both can fire on the
 *  same session and either or both can be ignored by the UI. */
export const MVP_COACH_RULES: readonly CoachRule[] = [
  ruleRpeClimbingFatigue,
  ruleDoubleProgression,
  ruleRepProgression,
  ruleFlatE1rmDeload,
  ruleMuscleRecency,
];

/**
 * Evaluate every rule in order and return the suggestions that fire.
 * Stays pure and synchronous — the UI calls this on every render. Order in
 * the output mirrors `rules` order so the surface is deterministic.
 */
export function evaluateCoach(
  ctx: CoachContext,
  rules: readonly CoachRule[] = MVP_COACH_RULES,
): CoachSuggestion[] {
  const out: CoachSuggestion[] = [];
  for (const rule of rules) {
    const hit = rule.evaluate(ctx);
    if (hit) out.push(hit);
  }
  return out;
}
