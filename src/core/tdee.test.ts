import { describe, it, expect } from 'vitest';
import {
  initState,
  stepDay,
  confidenceFromState,
  runFilter,
  KCAL_PER_KG,
  WARMUP_MIN_OBS,
  WARMUP_MAX_SD,
  SD_MEDIUM,
  MAX_GAP_DAYS,
  P0_E,
  P_RESTART_E,
  type DayInput,
  type TdeeState,
} from '@/core/tdee';

// R-07 / D-B4 — deterministic adaptive-TDEE filter tests. No wall clock is
// read: every gapDays / day input is passed explicitly (frozen-clock
// pattern, same discipline as src/core/liveness.test.ts).

// A small deterministic pseudo-random generator so "noisy weigh-in"
// scenarios are reproducible (the filter itself is pure; the noise is too).
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000; // [0,1)
  };
}

const E0 = 2400; // cold-start expenditure prior the edge would pass in
const W0 = 80; // cold-start weight

describe('initState', () => {
  it('seeds trend/expenditure and the cold-start covariance', () => {
    const s = initState(W0, E0);
    expect(s.trendWeightKg).toBe(W0);
    expect(s.expenditureKcal).toBe(E0);
    expect(s.covWE).toBe(0);
    expect(s.covEE).toBe(P0_E);
    expect(s.observationsCount).toBe(0);
  });

  it('a fresh state is low-confidence and warming up', () => {
    const c = confidenceFromState(initState(W0, E0));
    expect(c.band).toBe('low');
    expect(c.isWarmup).toBe(true);
  });
});

describe('convergence on synthetic steady state', () => {
  // True world: expenditure 2600 kcal/day, intake exactly 2600 (weight
  // stable), daily weigh-ins = 80 kg + independent noise. The filter starts
  // with a WRONG prior (E0 = 2400) and must learn ~2600.
  const TRUE_E = 2600;
  const TRUE_W = 80;

  function steadyDays(n: number, noiseSeed: number): DayInput[] {
    const rnd = lcg(noiseSeed);
    return Array.from({ length: n }, () => ({
      intakeKcal: TRUE_E,
      weightKg: TRUE_W + (rnd() - 0.5) * 1.6, // ±0.8 kg scatter
      gapDays: 1,
    }));
  }

  it('expenditure converges toward the true value and SD shrinks monotonically', () => {
    const { state, series } = runFilter(initState(W0, TRUE_W), steadyDays(120, 42));
    // Learned expenditure is close to truth (started 200 kcal off).
    expect(Math.abs(state.expenditureKcal - TRUE_E)).toBeLessThan(60);
    // Expenditure SD shrinks essentially monotonically and lands in `high`.
    const sds = series.map((p) => p.confidence.expenditureSd);
    for (let i = 5; i < sds.length; i++) {
      expect(sds[i]).toBeLessThanOrEqual(sds[i - 1] + 1e-9);
    }
    expect(series[series.length - 1].confidence.band).toBe('high');
  });

  it('is deterministic — identical inputs produce a bit-identical state', () => {
    const a = runFilter(initState(W0, TRUE_W), steadyDays(60, 7)).state;
    const b = runFilter(initState(W0, TRUE_W), steadyDays(60, 7)).state;
    expect(a).toEqual(b);
  });

  it('crosses out of warm-up only after WARMUP_MIN_OBS weigh-ins', () => {
    const days = steadyDays(WARMUP_MIN_OBS + 30, 99);
    let s = initState(W0, TRUE_W);
    for (let i = 0; i < days.length; i++) {
      s = stepDay(s, days[i]);
      if (i + 1 < WARMUP_MIN_OBS) {
        expect(confidenceFromState(s).isWarmup).toBe(true);
      }
    }
    expect(s.observationsCount).toBe(days.length);
    expect(confidenceFromState(s).isWarmup).toBe(false);
  });
});

describe('step change in TRUE expenditure', () => {
  // The honest step-change test: a real metabolic shift the filter must
  // discover from the residual. Intake is held CONSTANT; what changes is
  // true expenditure, so the observed weight trajectory diverges from what
  // the old expenditure estimate predicts. (Stepping intake while true
  // expenditure is unchanged produces NO innovation — weight moves exactly
  // as energy balance predicts — so it correctly should NOT move `e`.)
  it('discovers a sustained true-expenditure increase from the weight residual', () => {
    const rnd = lcg(123);
    const INTAKE = 2600;
    let s = initState(W0, 80);
    let w = 80;

    // Phase 1: 120 days, true expenditure 2600 == intake → weight stable.
    for (let i = 0; i < 120; i++) {
      s = stepDay(s, { intakeKcal: INTAKE, weightKg: w + (rnd() - 0.5) * 1.0, gapDays: 1 });
    }
    const before = s.expenditureKcal;
    expect(Math.abs(before - 2600)).toBeLessThan(60);
    expect(confidenceFromState(s).band).toBe('high');

    // Phase 2: true expenditure rises to 2900 (e.g. new training block),
    // intake unchanged at 2600 → genuine ~300 kcal/day deficit, weight now
    // actually falls. The filter must track expenditure UP toward ~2900.
    const TRUE_E2 = 2900;
    for (let i = 0; i < 220; i++) {
      w += (INTAKE - TRUE_E2) / KCAL_PER_KG; // real deficit → weight drops
      s = stepDay(s, { intakeKcal: INTAKE, weightKg: w + (rnd() - 0.5) * 1.0, gapDays: 1 });
    }
    // Expenditure moved substantially toward the new true level.
    expect(s.expenditureKcal).toBeGreaterThan(before + 150);
    expect(s.expenditureKcal).toBeLessThan(TRUE_E2 + 100);
    // Still a usable (non-warm-up) estimate after the adaptation.
    expect(confidenceFromState(s).isWarmup).toBe(false);
  });
});

describe('missing weigh-in days', () => {
  it('grows covariance, leaves observationsCount unchanged, emits no NaN', () => {
    let s = initState(W0, E0);
    s = stepDay(s, { intakeKcal: 2500, weightKg: 80, gapDays: 1 });
    const obsAfterFirst = s.observationsCount;
    const eeAfterFirst = s.covEE;

    // 5 consecutive days with intake but NO weigh-in.
    for (let i = 0; i < 5; i++) {
      s = stepDay(s, { intakeKcal: 2500, weightKg: null, gapDays: 1 });
    }
    expect(s.observationsCount).toBe(obsAfterFirst); // unchanged — no measurement
    expect(s.covEE).toBeGreaterThan(eeAfterFirst); // uncertainty grew
    expect(Number.isFinite(s.expenditureKcal)).toBe(true);
    expect(Number.isFinite(s.trendWeightKg)).toBe(true);
  });
});

describe('missing intake days', () => {
  it("intake gaps don't bias expenditure vs the no-gap run", () => {
    const rnd1 = lcg(2024);
    const rnd2 = lcg(2024);
    let withGaps = initState(W0, 2500);
    let noGaps = initState(W0, 2500);
    for (let i = 0; i < 80; i++) {
      const wNoise1 = (rnd1() - 0.5) * 1.0;
      const wNoise2 = (rnd2() - 0.5) * 1.0;
      const weight = 80 + wNoise1;
      // Every 7th day intake is "not logged" in the gappy run.
      const intakeKcal = i % 7 === 6 ? null : 2500;
      withGaps = stepDay(withGaps, { intakeKcal, weightKg: weight, gapDays: 1 });
      noGaps = stepDay(noGaps, { intakeKcal: 2500, weightKg: 80 + wNoise2, gapDays: 1 });
    }
    // Not identical, but the gap must not systematically bias expenditure.
    expect(Math.abs(withGaps.expenditureKcal - noGaps.expenditureKcal)).toBeLessThan(80);
  });
});

describe('long gap', () => {
  it('warm-restarts beyond MAX_GAP_DAYS: re-inflates expenditure variance, re-engages warm-up', () => {
    // Converge first.
    let s = initState(W0, 80);
    for (let i = 0; i < 60; i++) {
      s = stepDay(s, { intakeKcal: 2600, weightKg: 80, gapDays: 1 });
    }
    expect(confidenceFromState(s).isWarmup).toBe(false);
    const eBefore = s.expenditureKcal;

    // A single step covering a > MAX_GAP_DAYS absence, with a fresh weigh-in.
    s = stepDay(s, { intakeKcal: 2600, weightKg: 83, gapDays: MAX_GAP_DAYS + 10 });

    expect(s.trendWeightKg).toBe(83); // re-anchored to the present weigh-in
    expect(s.expenditureKcal).toBe(eBefore); // expenditure kept as best prior
    expect(s.covEE).toBe(P_RESTART_E); // variance re-inflated
    expect(s.observationsCount).toBe(0); // warm-up gate re-engaged
    expect(confidenceFromState(s).isWarmup).toBe(true);
    expect(Number.isFinite(s.expenditureKcal)).toBe(true);
  });

  it('edge long-gap short-circuit: one step over a real >MAX_GAP_DAYS outage re-anchors to a sane low-confidence state', () => {
    // Mirrors recalculate-tdee/index.ts's production warm-restart path: the
    // edge detects daysBetweenISO(last_updated_on, computedOn) > MAX_GAP_DAYS
    // and applies the warm-restart as a SINGLE stepDay with the real, large
    // gapDays (no day-by-day replay of the gap). Frozen-clock: dates are
    // literal and the gap is computed via the same UTC-midnight diff the edge
    // uses — no wall clock is read.
    const daysBetweenISO = (fromISO: string, toISO: string): number => {
      const [fy, fm, fd] = fromISO.split('-').map(Number);
      const [ty, tm, td] = toISO.split('-').map(Number);
      return Math.round(
        (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
      );
    };
    const lastUpdatedOn = '2026-01-01';
    const computedOn = '2026-04-15'; // 104 days later (> MAX_GAP_DAYS = 45)
    const gapDays = daysBetweenISO(lastUpdatedOn, computedOn);
    expect(gapDays).toBeGreaterThan(MAX_GAP_DAYS);

    // A converged, high-confidence state going stale across the outage.
    let s = initState(W0, 80);
    for (let i = 0; i < 60; i++) {
      s = stepDay(s, { intakeKcal: 2600, weightKg: 80, gapDays: 1 });
    }
    expect(confidenceFromState(s).band).toBe('high');
    const ePrior = s.expenditureKcal;

    // The edge's exact call: intake null (branch ignores it), anchor weight =
    // latest weigh-in on/before computedOn, the real large gapDays.
    s = stepDay(s, { intakeKcal: null, weightKg: 82.5, gapDays });

    expect(s.trendWeightKg).toBe(82.5); // re-anchored to the anchor weigh-in
    expect(s.expenditureKcal).toBe(ePrior); // expenditure kept as best prior
    expect(s.covEE).toBe(P_RESTART_E); // variance re-inflated (warm restart)
    expect(s.observationsCount).toBe(0); // warm-up gate re-engaged
    const conf = confidenceFromState(s);
    expect(conf.isWarmup).toBe(true);
    expect(conf.band).toBe('low'); // sane low-confidence re-anchored state
    expect(Number.isFinite(s.expenditureKcal)).toBe(true);
    expect(Number.isFinite(s.trendWeightKg)).toBe(true);
  });

  it('carries weight when a long gap has no weigh-in', () => {
    let s = initState(W0, 2500);
    s = stepDay(s, { intakeKcal: 2500, weightKg: 81, gapDays: 1 });
    const w = s.trendWeightKg;
    s = stepDay(s, { intakeKcal: null, weightKg: null, gapDays: MAX_GAP_DAYS + 5 });
    expect(s.trendWeightKg).toBe(w); // drift-free carry, no NaN
    expect(s.observationsCount).toBe(0);
  });
});

describe('variance → confidence mapping (boundary table)', () => {
  function stateWith(covEE: number, obs: number): TdeeState {
    return {
      trendWeightKg: 80,
      expenditureKcal: 2500,
      covWW: 1,
      covWE: 0,
      covEE,
      observationsCount: obs,
    };
  }

  it('below WARMUP_MIN_OBS observations is always low/warm-up', () => {
    const c = confidenceFromState(stateWith(10 * 10, WARMUP_MIN_OBS - 1));
    expect(c.band).toBe('low');
    expect(c.isWarmup).toBe(true);
  });

  it('settled + SD just above WARMUP_MAX_SD is still warm-up (low)', () => {
    const sd = WARMUP_MAX_SD + 1;
    const c = confidenceFromState(stateWith(sd * sd, WARMUP_MIN_OBS + 50));
    expect(c.isWarmup).toBe(true);
    expect(c.band).toBe('low');
  });

  it('settled, WARMUP_MAX_SD ≥ SD > SD_MEDIUM → medium', () => {
    const sd = (SD_MEDIUM + WARMUP_MAX_SD) / 2;
    const c = confidenceFromState(stateWith(sd * sd, WARMUP_MIN_OBS + 50));
    expect(c.isWarmup).toBe(false);
    expect(c.band).toBe('medium');
  });

  it('settled, SD ≤ SD_MEDIUM → high', () => {
    const sd = SD_MEDIUM - 1;
    const c = confidenceFromState(stateWith(sd * sd, WARMUP_MIN_OBS + 50));
    expect(c.isWarmup).toBe(false);
    expect(c.band).toBe('high');
  });

  it('exactly SD_MEDIUM is high (boundary is inclusive)', () => {
    const c = confidenceFromState(stateWith(SD_MEDIUM * SD_MEDIUM, WARMUP_MIN_OBS + 50));
    expect(c.band).toBe('high');
  });

  it('exactly WARMUP_MIN_OBS observations is no longer warm-up on the obs axis', () => {
    // obs gate uses strict `<`, so exactly WARMUP_MIN_OBS clears it; the SD
    // (small here) then decides the band.
    const c = confidenceFromState(stateWith(SD_MEDIUM * SD_MEDIUM, WARMUP_MIN_OBS));
    expect(c.isWarmup).toBe(false);
  });
});

describe('determinism regression pin', () => {
  it('a fixed scripted scenario yields a pinned final state', () => {
    const days: DayInput[] = [
      { intakeKcal: 2400, weightKg: 80.0, gapDays: 1 },
      { intakeKcal: 2450, weightKg: 80.1, gapDays: 1 },
      { intakeKcal: 2400, weightKg: null, gapDays: 1 },
      { intakeKcal: null, weightKg: 79.9, gapDays: 1 },
      { intakeKcal: 2500, weightKg: 80.05, gapDays: 2 },
    ];
    const { state } = runFilter(initState(80, 2400), days);
    // Pinned — any math change must consciously update these values.
    expect(state.trendWeightKg).toBeCloseTo(80.022835, 5);
    expect(state.expenditureKcal).toBeCloseTo(2402.094282, 4);
    expect(state.observationsCount).toBe(4);
  });
});
