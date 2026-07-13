// @vitest-environment jsdom
//
// R-33 wave 6 PR-B (Task 6) — the create-then-select contract, from CALLER ONE.
//
// You type a name into a recipe row, the ingredient does not exist, you hit
// "＋ crear «…»", you create it — and it lands SELECTED in the row you were
// filling. That round trip is the only reason the slim dialog was kept instead
// of routing out to `/recipes/ingredients/new/manual` and back, so it is pinned
// end-to-end here (the real dialog, the real editor, only the mutations mocked)
// rather than by asserting on props.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const { search, createMut } = vi.hoisted(() => ({
  search: { data: [] as unknown[], isLoading: false },
  createMut: { mutateAsync: vi.fn(), isPending: false },
}));
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => search,
  useCreateManualIngredient: () => createMut,
  useImportFromOFF: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateIngredient: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { IngredientAutocomplete } from './IngredientAutocomplete';
import type { Ingredient } from '@/features/ingredients/api';

const AVENA = {
  id: 'new-1',
  name: 'Avena',
  name_en: null,
  brand: null,
  source: 'manual',
  external_id: null,
  is_verified: false,
  unit_type: 'gram',
  kcal_per_unit: 165,
  protein_g_per_unit: 10,
  carbs_g_per_unit: 20,
  fat_g_per_unit: 5,
  fiber_g_per_unit: 0,
  sugar_g_per_unit: null,
  saturated_fat_g_per_unit: null,
  salt_g_per_unit: null,
  created_by_user_id: 'u1',
  created_at: '2026-07-13T10:00:00Z',
  updated_at: '2026-07-13T10:00:00Z',
} as Ingredient;

beforeEach(async () => {
  await i18n.changeLanguage('es');
  search.data = [];
  search.isLoading = false;
  createMut.mutateAsync.mockReset().mockResolvedValue(AVENA);
});

describe('IngredientAutocomplete — create-then-select', () => {
  it('creates the ingredient the search could not find and selects it into the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<IngredientAutocomplete selected={null} onSelect={onSelect} onClear={vi.fn()} />);

    await user.type(screen.getByLabelText('Buscar ingrediente…'), 'avena');
    await user.click(await screen.findByRole('button', { name: /Crear "avena"/ }));

    // The dialog opens on the name you were searching for — no retyping.
    const name = await screen.findByLabelText('Nombre');
    expect(name).toHaveValue('avena');

    await user.type(screen.getByLabelText('Proteínas'), '10');
    await user.type(screen.getByLabelText('Carbohidratos'), '20');
    await user.type(screen.getByLabelText('Grasas'), '5');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalled());
    // THE assertion: the created row comes back to the caller, selected.
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(AVENA));
  });
});
