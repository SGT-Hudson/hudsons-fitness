// @vitest-environment jsdom
//
// R-33 wave 6 PR-B — the editor ROUTES (Task 3).
//
// The sibling component test (`IngredientEditorForm.test.tsx`) pins the form's
// own submit branch. This one pins the step BEFORE it: what the page hands the
// form, which is where the two irreversible bugs live.
//
//  1. **The OFF product must survive the navigation.** Tasks 4 (method picker)
//     and 5 (scanner) reach `/new/manual` carrying an `OFFSearchResult` in
//     `location.state`. If the page fails to hand it to the form's `offProduct`
//     prop, the save silently takes the create-manual branch and a scanned
//     product lands as a manual row with NO `external_id` — invisible, and
//     unrecoverable without re-scanning.
//  2. **The edit route is ownership-gated.** `updateIngredient` is a direct
//     table write under RLS: a deep link to a row I did not create must
//     redirect, not render an editor whose only possible outcome is a 400.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// The page's import graph reaches `@/lib/supabase` (via ../api types and the
// hooks), which throws at module load without VITE_SUPABASE_* — green locally,
// red in CI.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const { createMut, importMut, updateMut, useIngredient } = vi.hoisted(() => ({
  createMut: { mutateAsync: vi.fn(), isPending: false },
  importMut: { mutateAsync: vi.fn(), isPending: false },
  updateMut: { mutateAsync: vi.fn(), isPending: false },
  useIngredient: vi.fn(),
}));
vi.mock('@/features/ingredients/hooks', () => ({
  useCreateManualIngredient: () => createMut,
  useImportFromOFF: () => importMut,
  useUpdateIngredient: () => updateMut,
  useIngredient: (id: string | null) => useIngredient(id),
}));

const useAuth = vi.fn();
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => useAuth() }));

import { IngredientEditorPage } from './IngredientEditorPage';
import type { IngredientEditorRouteState } from '@/features/ingredients/editorRoute';
import type { Ingredient } from '@/features/ingredients/api';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

function ingredient(over: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'i-1',
    name: 'Yogur natural griego',
    name_en: null,
    brand: 'Pascual',
    source: 'manual',
    external_id: null,
    is_verified: false,
    unit_type: 'gram',
    kcal_per_unit: 116,
    protein_g_per_unit: 4.5,
    carbs_g_per_unit: 4.2,
    fat_g_per_unit: 9.7,
    fiber_g_per_unit: 0,
    sugar_g_per_unit: 4,
    saturated_fat_g_per_unit: 6.4,
    salt_g_per_unit: null,
    created_by_user_id: 'u1',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...over,
  } as Ingredient;
}

function offResult(over: Partial<OFFSearchResult> = {}): OFFSearchResult {
  return {
    code: '8410530305012',
    name: 'Yogur natural griego',
    brand: 'Pascual',
    thumbnailUrl: null,
    kcalPer100g: 116,
    proteinPer100g: 4.5,
    carbsPer100g: 4.2,
    fatPer100g: 9.7,
    fiberPer100g: 0,
    sugarPer100g: 4,
    satFatPer100g: 6.4,
    saltPer100g: null,
    ...over,
  };
}

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname + search}</div>;
}

/** Mount the two real routes, so the page reads its params exactly as it will in the app. */
function renderAt(path: string, state?: IngredientEditorRouteState) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.split('?')[1] ? `?${path.split('?')[1]}` : '', state }]}>
      <Routes>
        <Route path="/recipes/ingredients" element={<div>IngredientesPage</div>} />
        <Route path="/recipes/ingredients/new/manual" element={<IngredientEditorPage />} />
        <Route path="/recipes/ingredients/:id/edit" element={<IngredientEditorPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

// PageShell mounts BOTH headers at once (BackHeader below md, PageHeaderV2 at
// md+; CSS hides one, and jsdom applies no CSS) — so every header action exists
// twice. Either node submits the same form.
const nameField = () => screen.getByLabelText('Nombre');
const save = () => screen.getAllByRole('button', { name: 'Guardar' })[0];
const cancel = () => screen.getAllByRole('button', { name: 'Cancelar' })[0];

async function fillMacros(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Proteínas/), '10');
  await user.type(screen.getByLabelText(/Carbohidratos/), '20');
  await user.type(screen.getByLabelText(/Grasas/), '5');
}

beforeEach(async () => {
  createMut.mutateAsync.mockReset().mockResolvedValue(ingredient());
  importMut.mutateAsync.mockReset().mockResolvedValue(ingredient({ source: 'openfoodfacts' }));
  updateMut.mutateAsync.mockReset().mockResolvedValue(ingredient());
  useIngredient.mockReset().mockReturnValue({ data: undefined, isLoading: false, error: null });
  useAuth.mockReset().mockReturnValue({ user: { id: 'u1', email: 'qa@x.dev' } });
  await i18n.changeLanguage('es');
});

describe('IngredientEditorPage — /recipes/ingredients/new/manual', () => {
  // THE test of this task. The product must reach the form's `offProduct` prop,
  // or the save silently becomes a manual row with no EAN.
  it('seeds from the OFF product in location.state and saves it as an OFF import', async () => {
    const user = userEvent.setup();
    const product = offResult();
    renderAt('/recipes/ingredients/new/manual', { offProduct: product });

    // Seeded: the form is showing OFF's values, not a blank create.
    expect(nameField()).toHaveValue('Yogur natural griego');

    await user.click(save());

    await waitFor(() => expect(importMut.mutateAsync).toHaveBeenCalledTimes(1));
    // The product itself travels (the EAN is what `external_id` is written from).
    expect(importMut.mutateAsync.mock.calls[0][0].product).toEqual(product);
    expect(importMut.mutateAsync.mock.calls[0][0].overrides).toMatchObject({
      name: 'Yogur natural griego',
      kcal_per_unit: 116,
    });
    // …and the manual-create branch never ran.
    expect(createMut.mutateAsync).not.toHaveBeenCalled();
  });

  it('creates a manual row when nothing travelled in location.state', async () => {
    const user = userEvent.setup();
    renderAt('/recipes/ingredients/new/manual');

    await user.type(nameField(), 'Arroz basmati');
    await fillMacros(user);
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(createMut.mutateAsync.mock.calls[0][0]).toMatchObject({ name: 'Arroz basmati' });
    expect(importMut.mutateAsync).not.toHaveBeenCalled();
  });

  // The scanner's not-found path (Task 5): OFF does not know the code. There is
  // no product to import — `createManualIngredient` deliberately writes no
  // `external_id` (the `ingredients_external_consistency` CHECK forbids it on a
  // manual row) — so the code is shown as context and the save stays manual.
  it('shows a scanned EAN that OFF did not know, and still saves a manual row', async () => {
    const user = userEvent.setup();
    renderAt('/recipes/ingredients/new/manual', { ean: '8410530305012' });

    expect(screen.getByText(/8410530305012/)).toBeInTheDocument();

    await user.type(nameField(), 'Galletas raras');
    await fillMacros(user);
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(importMut.mutateAsync).not.toHaveBeenCalled();
  });

  // The full-screen search / method picker can hand over what the user typed.
  it('prefills the name handed over in location.state', () => {
    renderAt('/recipes/ingredients/new/manual', { name: 'Kefir' });
    expect(nameField()).toHaveValue('Kefir');
  });

  it('returns to the list after a successful create', async () => {
    const user = userEvent.setup();
    renderAt('/recipes/ingredients/new/manual', { offProduct: offResult() });

    await user.click(save());

    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients'));
    expect(screen.getByText('IngredientesPage')).toBeInTheDocument();
  });
});

describe('IngredientEditorPage — /recipes/ingredients/:id/edit', () => {
  it('loads the row and updates it', async () => {
    const user = userEvent.setup();
    useIngredient.mockReturnValue({ data: ingredient(), isLoading: false, error: null });
    renderAt('/recipes/ingredients/i-1/edit');

    expect(nameField()).toHaveValue('Yogur natural griego');

    await user.clear(nameField());
    await user.type(nameField(), 'Yogur griego 0%');
    await user.click(save());

    await waitFor(() => expect(updateMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMut.mutateAsync.mock.calls[0][0]).toMatchObject({
      id: 'i-1',
      patch: { name: 'Yogur griego 0%' },
    });
    expect(createMut.mutateAsync).not.toHaveBeenCalled();
    expect(importMut.mutateAsync).not.toHaveBeenCalled();
  });

  // Constraint 8. A row someone else created: `updateIngredient` is a direct
  // table write and RLS would reject it, so the editor must never render.
  it('redirects a deep link to a row I do not own', () => {
    useIngredient.mockReturnValue({
      data: ingredient({ created_by_user_id: 'someone-else' }),
      isLoading: false,
      error: null,
    });
    renderAt('/recipes/ingredients/i-1/edit');

    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients');
    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  // The system seeds (`created_by_user_id` null) are the third ownership state
  // recipes do not have — nobody may edit them.
  it('redirects a deep link to a system row', () => {
    useIngredient.mockReturnValue({
      data: ingredient({ created_by_user_id: null, source: 'system' }),
      isLoading: false,
      error: null,
    });
    renderAt('/recipes/ingredients/i-1/edit');

    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients');
    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  it('redirects to the list when the row cannot be fetched', () => {
    useIngredient.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('not found'),
    });
    renderAt('/recipes/ingredients/i-1/edit');

    expect(screen.getByText('IngredientesPage')).toBeInTheDocument();
  });

  it('renders no editor while the row is loading', () => {
    useIngredient.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderAt('/recipes/ingredients/i-1/edit');

    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  // The other half of the `?q=` round trip pinned in `IngredientesPage.test.tsx`
  // (which asserts the list carries its active query INTO the edit route): the
  // editor carries it back OUT, so the user lands on the list they were
  // searching, not on an unfiltered one.
  it('carries the active `?q=` back to the list on cancel', async () => {
    const user = userEvent.setup();
    useIngredient.mockReturnValue({ data: ingredient(), isLoading: false, error: null });
    renderAt('/recipes/ingredients/i-1/edit?q=yogur');

    await user.click(cancel());

    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients?q=yogur');
  });

  it('carries the active `?q=` back to the list after a successful save', async () => {
    const user = userEvent.setup();
    useIngredient.mockReturnValue({ data: ingredient(), isLoading: false, error: null });
    renderAt('/recipes/ingredients/i-1/edit?q=yogur');

    await user.click(save());

    await waitFor(() =>
      expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients?q=yogur'),
    );
  });
});
