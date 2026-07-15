// R-33 wave 4 task 2: the DB now stores each template's phase (nullable —
// null means "no phase", never coerced to the user's active phase). This
// pins that the phase travels both ways: listTemplates/fetchTemplate widen
// their selects to read it back, and saveTemplate forwards it to the
// save_template RPC unchanged, including the null case.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const order = vi.fn();
const single = vi.fn();
const eq = vi.fn();
const select = vi.fn();
const from = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import { listTemplates, fetchTemplate, saveTemplate } from './api';

beforeEach(() => {
  from.mockReset().mockReturnValue({ select });
  select.mockReset().mockReturnValue({ eq });
  eq.mockReset().mockReturnValue({ order, single });
  order.mockReset();
  single.mockReset();
  rpc.mockReset();
});

describe('listTemplates — phase_type surfaced on TemplateListItem', () => {
  it('reads phase_type back from the select and maps it through', async () => {
    order.mockResolvedValue({
      data: [
        {
          id: 'tpl-1',
          name: 'Cut week',
          is_auto_generated: false,
          default_meal_times: ['08:00'],
          updated_at: '2026-06-01T00:00:00.000Z',
          phase_type: 'cut',
          meal_plan_template_slots: [],
        },
      ],
      error: null,
    });

    const result = await listTemplates('user-1');

    expect(select).toHaveBeenCalledWith(expect.stringContaining('phase_type'));
    expect(result[0].phase_type).toBe('cut');
  });

  it('surfaces a null phase_type as null, never a default', async () => {
    order.mockResolvedValue({
      data: [
        {
          id: 'tpl-2',
          name: 'No phase',
          is_auto_generated: false,
          default_meal_times: [],
          updated_at: '2026-06-01T00:00:00.000Z',
          phase_type: null,
          meal_plan_template_slots: [],
        },
      ],
      error: null,
    });

    const result = await listTemplates('user-1');

    expect(result[0].phase_type).toBeNull();
  });
});

describe('fetchTemplate — phase_type surfaced on TemplateDetail', () => {
  it('reads phase_type back from the select and maps it through', async () => {
    single.mockResolvedValue({
      data: {
        id: 'tpl-1',
        name: 'Bulk week',
        same_schedule_all_days: true,
        default_meal_times: ['08:00'],
        is_auto_generated: false,
        phase_type: 'bulk',
        meal_plan_template_slots: [],
      },
      error: null,
    });

    const result = await fetchTemplate('tpl-1');

    expect(select).toHaveBeenCalledWith(expect.stringContaining('phase_type'));
    expect(result.phase_type).toBe('bulk');
  });

  it('surfaces a null phase_type as null, never a default', async () => {
    single.mockResolvedValue({
      data: {
        id: 'tpl-1',
        name: 'No phase',
        same_schedule_all_days: true,
        default_meal_times: [],
        is_auto_generated: false,
        phase_type: null,
        meal_plan_template_slots: [],
      },
      error: null,
    });

    const result = await fetchTemplate('tpl-1');

    expect(result.phase_type).toBeNull();
  });
});

describe('saveTemplate — forwards phaseType to the RPC unchanged', () => {
  it('sends p_phase_type for a non-null phase', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null });

    await saveTemplate({
      templateId: null,
      name: 'Cut week',
      sameScheduleAllDays: true,
      defaultMealTimes: ['08:00'],
      slots: [],
      phaseType: 'cut',
    });

    expect(rpc).toHaveBeenCalledWith(
      'save_template',
      expect.objectContaining({ p_phase_type: 'cut' }),
    );
  });

  it('sends p_phase_type: null as a first-class value, not omitted', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null });

    await saveTemplate({
      templateId: null,
      name: 'No phase',
      sameScheduleAllDays: true,
      defaultMealTimes: ['08:00'],
      slots: [],
      phaseType: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      'save_template',
      expect.objectContaining({ p_phase_type: null }),
    );
  });
});
