import { describe, it, expect } from 'vitest';
import {
  daysBetweenISO,
  evaluateFreshness,
  decideAlert,
  STALE_AFTER_DAYS,
  type FreshnessResult,
} from '@/core/liveness';

// R-18 / D-F5 — deterministic freshness-predicate tests. No wall clock is
// read: every `todayISO` is passed explicitly (frozen-clock pattern).

describe('daysBetweenISO', () => {
  it('counts whole calendar days, to - from', () => {
    expect(daysBetweenISO('2026-05-16', '2026-05-18')).toBe(2);
    expect(daysBetweenISO('2026-05-18', '2026-05-18')).toBe(0);
  });

  it('is negative when "to" precedes "from" (future data)', () => {
    expect(daysBetweenISO('2026-05-20', '2026-05-18')).toBe(-2);
  });

  it('is DST-immune (UTC midnights) across the Madrid spring-forward', () => {
    // Europe/Madrid DST change 2026-03-29; a wall-clock-based diff could be
    // off by an hour and round wrong. UTC-midnight diff stays exact.
    expect(daysBetweenISO('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('counts across month and year boundaries', () => {
    expect(daysBetweenISO('2026-01-30', '2026-02-02')).toBe(3);
    expect(daysBetweenISO('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('evaluateFreshness — daily_history (threshold 2d)', () => {
  it('fresh: yesterday (inherent 1-day snapshot lag) is OK', () => {
    const r = evaluateFreshness({
      table: 'daily_history',
      latestISO: '2026-05-17',
      todayISO: '2026-05-18',
    });
    expect(r.ageDays).toBe(1);
    expect(r.stale).toBe(false);
    expect(r.reason).toBe('ok');
  });

  it('one missed daily run (age 2) is exactly at threshold → still OK (anti-flap)', () => {
    const r = evaluateFreshness({
      table: 'daily_history',
      latestISO: '2026-05-16',
      todayISO: '2026-05-18',
    });
    expect(r.ageDays).toBe(2);
    expect(r.stale).toBe(false);
  });

  it('two consecutive missed runs (age 3 > 2) → STALE', () => {
    const r = evaluateFreshness({
      table: 'daily_history',
      latestISO: '2026-05-15',
      todayISO: '2026-05-18',
    });
    expect(r.ageDays).toBe(3);
    expect(r.stale).toBe(true);
    expect(r.reason).toBe('stale');
  });

  it('empty table is treated as stale with reason "empty"', () => {
    const r = evaluateFreshness({
      table: 'daily_history',
      latestISO: null,
      todayISO: '2026-05-18',
    });
    expect(r.stale).toBe(true);
    expect(r.reason).toBe('empty');
    expect(r.ageDays).toBeNull();
  });

  it('future row (clock skew / backfill) is never stale', () => {
    const r = evaluateFreshness({
      table: 'daily_history',
      latestISO: '2026-05-20',
      todayISO: '2026-05-18',
    });
    expect(r.ageDays).toBe(-2);
    expect(r.stale).toBe(false);
  });
});

describe('evaluateFreshness — tdee_estimates (lenient threshold 4d)', () => {
  it('age 4 is at threshold → OK', () => {
    const r = evaluateFreshness({
      table: 'tdee_estimates',
      latestISO: '2026-05-14',
      todayISO: '2026-05-18',
    });
    expect(r.ageDays).toBe(4);
    expect(r.stale).toBe(false);
  });

  it('age 5 > 4 → stale', () => {
    const r = evaluateFreshness({
      table: 'tdee_estimates',
      latestISO: '2026-05-13',
      todayISO: '2026-05-18',
    });
    expect(r.stale).toBe(true);
  });

  it('uses the configured constant, not a literal', () => {
    expect(STALE_AFTER_DAYS.daily_history).toBe(2);
    expect(STALE_AFTER_DAYS.tdee_estimates).toBe(4);
  });
});

describe('decideAlert — rollup', () => {
  const fresh = (table: 'daily_history' | 'tdee_estimates'): FreshnessResult => ({
    table,
    latestISO: '2026-05-17',
    ageDays: 1,
    thresholdDays: STALE_AFTER_DAYS[table],
    stale: false,
    reason: 'ok',
  });
  const stale = (table: 'daily_history' | 'tdee_estimates'): FreshnessResult => ({
    table,
    latestISO: '2026-05-10',
    ageDays: 8,
    thresholdDays: STALE_AFTER_DAYS[table],
    stale: true,
    reason: 'stale',
  });

  it('all fresh → no alert', () => {
    const d = decideAlert([fresh('daily_history'), fresh('tdee_estimates')]);
    expect(d.alert).toBe(false);
    expect(d.message).toContain('cron liveness OK');
  });

  it('stale daily_history → ALERT (primary signal)', () => {
    const d = decideAlert([stale('daily_history'), fresh('tdee_estimates')]);
    expect(d.alert).toBe(true);
    expect(d.message).toContain('CRON LIVENESS ALERT');
  });

  it('stale tdee only (daily fresh) → NO alert, but noted in message', () => {
    const d = decideAlert([fresh('daily_history'), stale('tdee_estimates')]);
    expect(d.alert).toBe(false);
    expect(d.message).toContain('tdee_estimates is stale');
    expect(d.message).not.toContain('CRON LIVENESS ALERT');
  });

  it('both stale → ALERT', () => {
    const d = decideAlert([stale('daily_history'), stale('tdee_estimates')]);
    expect(d.alert).toBe(true);
  });

  it('empty daily_history → ALERT', () => {
    const empty: FreshnessResult = {
      table: 'daily_history',
      latestISO: null,
      ageDays: null,
      thresholdDays: 2,
      stale: true,
      reason: 'empty',
    };
    const d = decideAlert([empty, fresh('tdee_estimates')]);
    expect(d.alert).toBe(true);
    expect(d.message).toContain('daily_history=EMPTY');
  });
});
