import { describe, expect, it, vi } from 'vitest';

// hooks.ts transitively imports @/lib/supabase (via api) and AuthProvider;
// both throw/blow up without env/context. We only test the pure window math.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { windowStartFor } from './hooks';

describe('windowStartFor', () => {
  it('7d is an inclusive 7-day span', () => {
    expect(windowStartFor('7d', '2026-05-26')).toBe('2026-05-20');
  });
  it('30d inclusive', () => {
    expect(windowStartFor('30d', '2026-05-26')).toBe('2026-04-27');
  });
  it('6mo subtracts 6 months', () => {
    expect(windowStartFor('6mo', '2026-05-26')).toBe('2025-11-26');
  });
  it('all → null', () => {
    expect(windowStartFor('all', '2026-05-26')).toBeNull();
  });
});
