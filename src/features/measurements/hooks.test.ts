import { describe, expect, it, vi } from 'vitest';

// hooks.ts transitively imports @/lib/supabase (via api) and AuthProvider; both
// throw/blow up without env/context. We only test the pure range math.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { fromDateForRange, TIME_RANGES, DEFAULT_TIME_RANGE } from './hooks';

// Local noon: `isoDate` formats in the local zone, so this stays the same
// calendar day whatever TZ the runner is in.
const NOW = new Date(2026, 6, 14, 12, 0, 0);

describe('fromDateForRange', () => {
  it('1m looks back 30 days', () => {
    expect(fromDateForRange('1m', NOW)).toBe('2026-06-14');
  });

  it('6m looks back 182 days', () => {
    expect(fromDateForRange('6m', NOW)).toBe('2026-01-13');
  });

  it('1y looks back one calendar year', () => {
    expect(fromDateForRange('1y', NOW)).toBe('2025-07-14');
  });

  it('all has no lower bound', () => {
    expect(fromDateForRange('all', NOW)).toBeNull();
  });

  it('does not mutate the given date', () => {
    const now = new Date(NOW);
    fromDateForRange('6m', now);
    expect(now.toISOString()).toBe(NOW.toISOString());
  });

  it('exposes the four presets in display order, defaulting to 6m', () => {
    expect(TIME_RANGES).toEqual(['1m', '6m', '1y', 'all']);
    expect(DEFAULT_TIME_RANGE).toBe('6m');
  });
});
