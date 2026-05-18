import { describe, it, expect } from 'vitest';
import {
  smoothedRatePerWeek,
  compositionDelta,
  deltaTone,
  TREND_LOOKBACK_DAYS,
} from './trend';

describe('smoothedRatePerWeek', () => {
  it('null with fewer than 2 usable points', () => {
    expect(
      smoothedRatePerWeek([{ measuredOn: '2026-05-18', ma5: 80 }]),
    ).toBeNull();
  });

  it('computes kg/week from the ~7-days-ago point', () => {
    const r = smoothedRatePerWeek(
      [
        { measuredOn: '2026-05-11', ma5: 79.3 },
        { measuredOn: '2026-05-18', ma5: 78.7 },
      ],
    );
    expect(r).toBeCloseTo(-0.6, 5);
  });

  it('ignores null ma5 points', () => {
    const r = smoothedRatePerWeek(
      [
        { measuredOn: '2026-05-11', ma5: 79.3 },
        { measuredOn: '2026-05-14', ma5: null },
        { measuredOn: '2026-05-18', ma5: 78.7 },
      ],
    );
    expect(r).toBeCloseTo(-0.6, 5);
  });
});

describe('compositionDelta', () => {
  it('latest minus the ≥7d-older prior', () => {
    const d = compositionDelta(
      [
        { measuredOn: '2026-05-01', value: 18.9 },
        { measuredOn: '2026-05-18', value: 18.2 },
      ],
    );
    expect(d).toBeCloseTo(-0.7, 5);
  });

  it('null when no prior non-null', () => {
    expect(
      compositionDelta([{ measuredOn: '2026-05-18', value: 18.2 }]),
    ).toBeNull();
  });
});

describe('deltaTone', () => {
  it('muscle is phase-independent: up=good, down=bad', () => {
    expect(deltaTone('muscle', 1)).toBe('good');
    expect(deltaTone('muscle', -1)).toBe('bad');
  });
  it('water is always neutral', () => {
    expect(deltaTone('water', -1, 'cut')).toBe('neutral');
  });
  it('weight on a cut: down=good, up=bad', () => {
    expect(deltaTone('weight', -1, 'cut')).toBe('good');
    expect(deltaTone('weight', 1, 'cut')).toBe('bad');
  });
  it('weight on a bulk: up=good', () => {
    expect(deltaTone('weight', 1, 'bulk')).toBe('good');
  });
  it('weight with no phase is neutral', () => {
    expect(deltaTone('weight', -1)).toBe('neutral');
  });
  it('body fat down=good when any phase is active, neutral otherwise', () => {
    expect(deltaTone('bodyFat', -1, 'bulk')).toBe('good');
    expect(deltaTone('bodyFat', -1)).toBe('neutral');
  });
  it('exposes the lookback constant', () => {
    expect(TREND_LOOKBACK_DAYS).toBe(7);
  });
  it('water with zero delta is neutral', () => {
    expect(deltaTone('water', 0)).toBe('neutral');
  });
  it('body fat down on maintenance is good', () => {
    expect(deltaTone('bodyFat', -1, 'maintenance')).toBe('good');
  });
});
