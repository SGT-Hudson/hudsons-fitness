// @vitest-environment jsdom
//
// R-33 wave 6 PR-B — the SLIM dialog (Task 6).
//
// The routes are the primary create/edit surface now. This dialog survives for
// exactly one job the routes cannot do: **create-then-select, in place** — you
// are filling a recipe row, the ingredient does not exist, you create it here
// and it comes straight back to the caller. So what is pinned here is that
// contract (seed in, created row out, closes) and the fact that everything else
// is GONE: no mode, no edit branch, no tabs-as-navigation.
//
// The body is `IngredientEditorForm` — the same editor the routes mount. Its
// own behaviour (auto-kcal, the submit branch, the preview) is pinned in
// `IngredientEditorForm.test.tsx`; this file does not re-test it.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The import graph reaches `@/lib/supabase` (via ../hooks), which throws at
// module load without VITE_SUPABASE_* — green locally, red in CI.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const { createMut, importMut, updateMut } = vi.hoisted(() => ({
  createMut: { mutateAsync: vi.fn(), isPending: false },
  importMut: { mutateAsync: vi.fn(), isPending: false },
  updateMut: { mutateAsync: vi.fn(), isPending: false },
}));
vi.mock('../hooks', () => ({
  useCreateManualIngredient: () => createMut,
  useImportFromOFF: () => importMut,
  useUpdateIngredient: () => updateMut,
}));

import { IngredientDialog } from './IngredientDialog';
import type { Ingredient } from '../api';

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

function renderDialog(over: { defaultName?: string } = {}) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <IngredientDialog
      open
      onOpenChange={onOpenChange}
      defaultName={over.defaultName}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
}

const save = () => screen.getByRole('button', { name: 'Guardar' });

async function fillMacros(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Proteínas'), '10');
  await user.type(screen.getByLabelText('Carbohidratos'), '20');
  await user.type(screen.getByLabelText('Grasas'), '5');
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  createMut.mutateAsync.mockReset().mockResolvedValue(AVENA);
  importMut.mutateAsync.mockReset();
  updateMut.mutateAsync.mockReset();
});

describe('IngredientDialog — create-only', () => {
  it('seeds the name with the query the caller gave up on', () => {
    renderDialog({ defaultName: '  avena  ' });
    expect(screen.getByLabelText('Nombre')).toHaveValue('avena');
  });

  // THE contract. Both callers (IngredientAutocomplete, AddIngredientSheet) hand
  // the created row straight into their own selection — `onSaved` is a plain
  // local callback, which is the whole reason this dialog was kept over routing
  // out and back.
  it('creates the ingredient, hands the saved row back, and closes', async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = renderDialog({ defaultName: 'avena' });

    await fillMacros(user);
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(createMut.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'avena', kcal_per_unit: 165, unit_type: 'gram' }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(AVENA));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('never updates — there is no edit branch left here (that is `/:id/edit`)', async () => {
    const user = userEvent.setup();
    renderDialog({ defaultName: 'avena' });

    await fillMacros(user);
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalled());
    expect(updateMut.mutateAsync).not.toHaveBeenCalled();
    expect(importMut.mutateAsync).not.toHaveBeenCalled();
  });

  // The three tabs are routes now: `/new` (the method picker), `/new/manual`
  // and `/scan`. Leaving them here would be a second, divergent create surface.
  it('has no tabs — no OpenFoodFacts search, no barcode tab', () => {
    renderDialog({ defaultName: 'avena' });

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByLabelText('Código de barras (EAN/UPC)')).toBeNull();
    expect(screen.queryByPlaceholderText('ej. yogur griego natural')).toBeNull();
  });

  it('is the editor, not a second form: the auto-kcal chip and the preview are here', async () => {
    const user = userEvent.setup();
    renderDialog({ defaultName: 'avena' });

    expect(screen.getByRole('region', { name: 'Vista previa' })).toBeInTheDocument();
    await fillMacros(user);
    await waitFor(() => expect(screen.getByLabelText('Calorías')).toHaveValue(165));
    expect(screen.getByText('auto')).toBeInTheDocument();
  });

  it('cancels without saving', async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = renderDialog({ defaultName: 'avena' });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createMut.mutateAsync).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
