// @vitest-environment jsdom
//
// R-33 wave 6 PR-B (Task 6) — the create-then-select contract, from CALLER TWO,
// and the wave-5 gap this closes.
//
// Wave 5 shipped this sheet WITHOUT a create path and said so in its own
// docblock: "there is no create-ingredient route to send a thumb to … Creating
// from here is wave 6's to wire." This is that wiring.
//
// The load-bearing detail: the created row must land in the sheet's `select()`,
// NOT in `onAdd`. `select()` is what expands the row with the quantity stepper;
// firing `onAdd` would append the ingredient to the recipe with a quantity the
// user never chose.
//
// jsdom renders the DESKTOP branch here (matchMedia true ⇒ ResponsiveDialog's
// Radix Dialog). On mobile the shell is a vaul Drawer and the create dialog
// nests INSIDE it — a nesting jsdom cannot judge (it applies no CSS, runs no
// focus-trap layout). That one is driven in a real browser, per the plan.
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

import { AddIngredientSheet } from './AddIngredientSheet';
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

// jsdom has no matchMedia; ResponsiveDialog needs one. Desktop branch (see the
// header note) — vaul does not survive jsdom.
beforeEach(async () => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: true,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage('es');
  search.data = [];
  search.isLoading = false;
  createMut.mutateAsync.mockReset().mockResolvedValue(AVENA);
});

function renderSheet() {
  const onAdd = vi.fn();
  render(
    <AddIngredientSheet open onOpenChange={vi.fn()} recipeName="Porridge" onAdd={onAdd} />,
  );
  return { onAdd };
}

async function createFromFooter(user: ReturnType<typeof userEvent.setup>, query = 'avena') {
  await user.type(screen.getByLabelText('Buscar en tu base…'), query);
  await user.click(await screen.findByRole('button', { name: 'Crear un alimento nuevo' }));

  const name = await screen.findByLabelText('Nombre');
  expect(name).toHaveValue(query);

  await user.type(screen.getByLabelText('Proteínas'), '10');
  await user.type(screen.getByLabelText('Carbohidratos'), '20');
  await user.type(screen.getByLabelText('Grasas'), '5');
  await user.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalled());
}

describe('AddIngredientSheet — the create escape hatch', () => {
  it('offers "crear un alimento nuevo" when the base has nothing', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('Buscar en tu base…'), 'avena');

    expect(
      await screen.findByRole('button', { name: 'Crear un alimento nuevo' }),
    ).toBeInTheDocument();
  });

  // THE test of this task. The created row must be SELECTED (the stepper
  // appears, the user picks a quantity) — not added blind.
  it('selects the created ingredient into the sheet, with its quantity stepper — it does NOT add it', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderSheet();

    await createFromFooter(user);

    // The created row is now the selected one: expanded, with the stepper.
    expect(await screen.findByLabelText('Aumentar la cantidad')).toBeInTheDocument();
    expect(screen.getByLabelText('Reducir la cantidad')).toBeInTheDocument();
    // Per-100 g ingredient ⇒ the stepper opens at a round 100 g.
    expect(screen.getByText('100')).toBeInTheDocument();
    // …and nothing has been appended to the recipe yet.
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('adds it to the recipe once the quantity is confirmed', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderSheet();

    await createFromFooter(user);
    await user.click(await screen.findByRole('button', { name: 'Añadir a la receta' }));

    expect(onAdd).toHaveBeenCalledWith(AVENA, 100);
  });
});
