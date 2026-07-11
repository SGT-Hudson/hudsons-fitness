// R-33 wave 4 task 2: saveWeekAsTemplate now takes the template phase and
// forwards it to save_week_as_template unchanged — including null, which is
// a first-class "no phase" value and must never be coerced to a default.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: (...args: unknown[]) => rpc(...args) },
}));

import { saveWeekAsTemplate } from './api';

beforeEach(() => {
  rpc.mockReset();
});

describe('saveWeekAsTemplate — forwards phaseType to the RPC unchanged', () => {
  it('sends p_phase_type for a non-null phase', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null });

    await saveWeekAsTemplate('week-1', 'My template', 'maintenance');

    expect(rpc).toHaveBeenCalledWith('save_week_as_template', {
      p_week_id: 'week-1',
      p_name: 'My template',
      p_phase_type: 'maintenance',
    });
  });

  it('sends p_phase_type: null as a first-class value, not omitted', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null });

    await saveWeekAsTemplate('week-1', 'My template', null);

    expect(rpc).toHaveBeenCalledWith('save_week_as_template', {
      p_week_id: 'week-1',
      p_name: 'My template',
      p_phase_type: null,
    });
  });
});
