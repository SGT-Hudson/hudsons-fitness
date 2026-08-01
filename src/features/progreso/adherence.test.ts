import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildAdherenceDays,
  phaseOnDate,
  targetKcalOnDate,
  toWeekGrid,
  MAX_ESTIMATE_CARRY_DAYS,
  type AdherencePhase,
} from './adherence';

const ABS: AdherencePhase = {
  start_date: '2026-03-01',
  end_date: '2026-03-31',
  kcal_mode: 'absolute',
  kcal_value: 2000,
};
const DELTA: AdherencePhase = {
  start_date: '2026-04-01',
  end_date: null,
  kcal_mode: 'tdee_delta',
  kcal_value: -500,
};

function build(over: Partial<Parameters<typeof buildAdherenceDays>[0]> = {}) {
  return buildAdherenceDays({
    from: '2026-03-01',
    to: '2026-03-03',
    firstSnapshotDate: '2026-03-01',
    consumedByDate: new Map(),
    phases: [ABS],
    tdeeByDate: new Map(),
    ...over,
  });
}

describe('phaseOnDate', () => {
  it('includes both boundary days', () => {
    expect(phaseOnDate([ABS], '2026-03-01')).toBe(ABS);
    expect(phaseOnDate([ABS], '2026-03-31')).toBe(ABS);
  });

  it('returns null the day before and the day after', () => {
    expect(phaseOnDate([ABS], '2026-02-28')).toBeNull();
    expect(phaseOnDate([ABS], '2026-04-01')).toBeNull();
  });

  it('treats a null end_date as open-ended', () => {
    expect(phaseOnDate([DELTA], '2027-01-01')).toBe(DELTA);
  });

  it('returns null inside a gap between two phases', () => {
    const later: AdherencePhase = { ...ABS, start_date: '2026-05-01', end_date: '2026-05-31' };
    expect(phaseOnDate([ABS, later], '2026-04-15')).toBeNull();
  });
});

describe('targetKcalOnDate', () => {
  it('uses kcal_value verbatim in absolute mode, ignoring any estimate', () => {
    expect(targetKcalOnDate([ABS], '2026-03-10', new Map([['2026-03-10', 9999]]))).toBe(2000);
  });

  it('adds the delta to that day’s own estimate in tdee_delta mode', () => {
    expect(targetKcalOnDate([DELTA], '2026-04-10', new Map([['2026-04-10', 2600]]))).toBe(2100);
  });

  it('carries an estimate that is one day stale forward', () => {
    expect(targetKcalOnDate([DELTA], '2026-04-10', new Map([['2026-04-09', 2600]]))).toBe(2100);
  });

  it(`carries an estimate exactly ${MAX_ESTIMATE_CARRY_DAYS} days stale (inclusive boundary)`, () => {
    // 2026-04-03 is exactly MAX_ESTIMATE_CARRY_DAYS (7) days before 2026-04-10.
    expect(targetKcalOnDate([DELTA], '2026-04-10', new Map([['2026-04-03', 2600]]))).toBe(2100);
  });

  it('does not use an estimate one day past the carry cap', () => {
    // 2026-04-02 is 8 days before 2026-04-10 — one past the cap.
    expect(targetKcalOnDate([DELTA], '2026-04-10', new Map([['2026-04-02', 2600]]))).toBeNull();
  });

  it('never borrows a later estimate backwards for an earlier day', () => {
    expect(targetKcalOnDate([DELTA], '2026-04-10', new Map([['2026-04-11', 2600]]))).toBeNull();
  });

  it('ignores a stale estimate in absolute mode too', () => {
    expect(targetKcalOnDate([ABS], '2026-03-10', new Map([['2026-03-09', 9999]]))).toBe(2000);
  });
});

describe('buildAdherenceDays — state banding', () => {
  it('is enObjetivo at exactly 10 % over', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 2200]]) });
    expect(d.state).toBe('enObjetivo');
    expect(d.deviationPct).toBeCloseTo(10, 6);
  });

  it('is enObjetivo at exactly 10 % under', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 1800]]) });
    expect(d.state).toBe('enObjetivo');
    expect(d.deviationPct).toBeCloseTo(-10, 6);
  });

  it('tips to cerca just past 10 %', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 2201]]) });
    expect(d.state).toBe('cerca');
  });

  it('is cerca at exactly 20 % and lejos just past it', () => {
    const [at] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 2400]]) });
    expect(at.state).toBe('cerca');
    const [past] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 2401]]) });
    expect(past.state).toBe('lejos');
  });

  it('bands under-eating by the same widths', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 1500]]) });
    expect(d.state).toBe('lejos');
    expect(d.deviationPct).toBeCloseTo(-25, 6);
  });
});

describe('buildAdherenceDays — the non-numeric states', () => {
  it('marks a day with a target but no logged kcal as sinRegistrar', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', null]]) });
    expect(d.state).toBe('sinRegistrar');
    expect(d.targetKcal).toBe(2000);
  });

  it('treats a logged zero as a real number, not as missing', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 0]]) });
    expect(d.state).toBe('lejos');
    expect(d.deviationPct).toBeCloseTo(-100, 6);
  });

  it('marks a day outside every phase as sinObjetivo', () => {
    const [d] = build({
      from: '2026-02-01',
      to: '2026-02-01',
      firstSnapshotDate: '2026-01-01',
      consumedByDate: new Map([['2026-02-01', 2000]]),
    });
    expect(d.state).toBe('sinObjetivo');
    expect(d.targetKcal).toBeNull();
  });

  it('marks a tdee_delta day whose nearest estimate is past the carry cap as sinObjetivo', () => {
    const [d] = build({
      from: '2026-04-10',
      to: '2026-04-10',
      firstSnapshotDate: '2026-01-01',
      phases: [DELTA],
      consumedByDate: new Map([['2026-04-10', 2000]]),
      tdeeByDate: new Map([['2026-04-02', 2600]]), // 8 days stale
    });
    expect(d.state).toBe('sinObjetivo');
    expect(d.targetKcal).toBeNull();
  });

  it('marks days before the first snapshot as sinDatos, not sinRegistrar', () => {
    const [d] = build({
      from: '2026-03-01',
      to: '2026-03-01',
      firstSnapshotDate: '2026-03-05',
    });
    expect(d.state).toBe('sinDatos');
  });

  it('returns sinDatos when there is no snapshot at all', () => {
    const [d] = build({ to: '2026-03-01', firstSnapshotDate: null });
    expect(d.state).toBe('sinDatos');
  });
});

describe('buildAdherenceDays — the date walk', () => {
  // Pinned to a DST-observing zone: under TZ=UTC (CI's default) a broken
  // local-time walk produces the same output as the correct UTC walk, so the
  // DST test below can't tell them apart without a zone that actually shifts.
  let previousTZ: string | undefined;

  beforeAll(() => {
    previousTZ = process.env.TZ;
    process.env.TZ = 'Europe/Madrid';
  });

  afterAll(() => {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  });

  it('emits every day in the inclusive range, in order', () => {
    const days = build({ from: '2026-03-01', to: '2026-03-03' });
    expect(days.map((d) => d.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('crosses a DST boundary without dropping or repeating a day', () => {
    // Europe/Madrid springs forward on 2026-03-29.
    const days = build({ from: '2026-03-28', to: '2026-03-30' });
    expect(days.map((d) => d.date)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });
});

describe('toWeekGrid', () => {
  it('lays days out as 7 rows with Monday first and pads the leading gap', () => {
    // 2026-03-01 is a Sunday, so the first column holds 6 nulls then that day.
    const grid = toWeekGrid(build({ from: '2026-03-01', to: '2026-03-03' }));
    expect(grid).toHaveLength(7);
    expect(grid[0][0]).toBeNull(); // Monday of the first (partial) week
    expect(grid[6][0]?.date).toBe('2026-03-01'); // Sunday
    expect(grid[0][1]?.date).toBe('2026-03-02'); // Monday of week 2
    expect(grid[1][1]?.date).toBe('2026-03-03');
  });

  it('pads the trailing gap so every row has the same column count', () => {
    const grid = toWeekGrid(build({ from: '2026-03-01', to: '2026-03-03' }));
    const widths = new Set(grid.map((row) => row.length));
    expect(widths.size).toBe(1);
    expect(grid[6][1]).toBeNull(); // Sunday of the unfinished second week
  });

  it('returns seven empty rows for an empty input', () => {
    expect(toWeekGrid([])).toEqual([[], [], [], [], [], [], []]);
  });
});
