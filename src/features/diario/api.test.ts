// R-12 / D-D6: materialization is now a single SECURITY INVOKER RPC
// (`materialize_plan_for_date`). The RPC body itself is SQL and cannot run
// here; what IS deterministically testable on the TS side is that the client
// `materializePlanForDate` is now a thin delegate to that RPC — it must call
// `supabase.rpc('materialize_plan_for_date', { p_user_id, p_date })`, surface
// the inserted count unchanged, coalesce a null return to 0, and throw on
// error. This also pins that the old hand-written query/dedup logic is gone:
// the only Supabase surface the function may touch is `.rpc(...)` (no
// `.from('meal_plan_weeks')` / `.from('meal_logs')` reads), which the mock
// asserts by exposing only `rpc`.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import { materializePlanForDate } from './api';

const USER = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  rpc.mockReset();
});

describe('materializePlanForDate (R-12 RPC delegate)', () => {
  it('calls the materialize_plan_for_date RPC with the user id and date', async () => {
    rpc.mockResolvedValue({ data: 3, error: null });

    const inserted = await materializePlanForDate(USER, '2026-05-17');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('materialize_plan_for_date', {
      p_user_id: USER,
      p_date: '2026-05-17',
    });
    expect(inserted).toBe(3);
  });

  it('passes through 0 when the RPC inserts nothing (already in sync / future date no-op)', async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    expect(await materializePlanForDate(USER, '2099-01-01')).toBe(0);
  });

  it('coalesces a null RPC return to 0', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await materializePlanForDate(USER, '2026-05-17')).toBe(0);
  });

  it('throws when the RPC returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('rpc failed') });
    await expect(materializePlanForDate(USER, '2026-05-17')).rejects.toThrow(
      'rpc failed',
    );
  });
});
