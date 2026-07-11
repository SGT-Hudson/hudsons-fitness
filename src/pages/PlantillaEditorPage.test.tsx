import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useTemplate = vi.fn();
const saveMutateAsync = vi.fn();
vi.mock('@/features/templates/hooks', () => ({
  useTemplate: (id: string | null) => useTemplate(id),
  useSaveTemplate: () => ({ mutateAsync: saveMutateAsync, isPending: false }),
  useRecipeMacros: () => ({ data: undefined }),
}));

vi.mock('@/features/planning/useDailyTarget', () => ({
  useDailyTarget: () => ({ targets: undefined, phaseType: 'bulk', proteinBasis: 'weight' }),
}));

import { PlantillaEditorPage } from './PlantillaEditorPage';
import type { TemplateDetail } from '@/features/templates/api';

const cutTemplate: TemplateDetail = {
  id: 't1',
  name: 'Semana de corte',
  same_schedule_all_days: true,
  default_meal_times: ['08:00:00', '14:00:00'],
  is_auto_generated: false,
  phase_type: 'cut',
  slots: [
    {
      id: 's1',
      day_of_week: 0,
      meal_index: 0,
      recipe_id: 'r1',
      recipe_name: 'Avena',
      servings: 1,
      display_order: 0,
    },
  ],
};

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates/:id" element={<PlantillaEditorPage />} />
        <Route path="/templates" element={<div>lista</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  useTemplate.mockReset();
  saveMutateAsync.mockReset();
  saveMutateAsync.mockResolvedValue('t1');
  await i18n.changeLanguage('es');
});

describe('PlantillaEditorPage', () => {
  // The editor has no phase picker yet (that is a later task), so a save must
  // carry the template's stored phase through untouched — `save_template`
  // writes `p_phase_type` unconditionally, so sending null would erase it.
  it('preserves the template phase on save', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });

    renderEditor('/templates/t1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 't1', phaseType: 'cut' }),
    );
  });

  it('keeps an untagged template untagged on save', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({
      data: { ...cutTemplate, phase_type: null },
      isLoading: false,
      error: null,
    });

    renderEditor('/templates/t1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ phaseType: null }));
  });

  // Never the user's ACTIVE phase (mocked to 'bulk' above) — a different concept.
  it('creates a new template with no phase', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: undefined, isLoading: false, error: null });

    renderEditor('/templates/new');
    await user.type(screen.getByLabelText(/nombre/i), 'Nueva');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: null, phaseType: null }),
    );
  });
});
