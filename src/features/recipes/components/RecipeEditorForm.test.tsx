// @vitest-environment jsdom
//
// R-33 wave 5 — the prep-time round trip through the REAL form.
//
// `save_recipe` writes `p_prep_time_minutes` unconditionally, so a save that
// carries no prep time genuinely clears the column. PR-B renders the real
// input, so the value now rides through a registered field instead of through
// `defaultValues` alone — and the round trip that matters most is still the one
// where the user NEVER TOUCHES it: open a recipe, rename it, save, keep the 35
// minutes it already had.
//
// The sibling Tier-1 test pins `recipeToEditorState` (the pure state builder).
// This one pins the half it cannot see: RHF + zodResolver + handleSubmit, i.e.
// what `onSubmit` ACTUALLY receives when the user presses save. The save button
// itself lives in the page header (PR-B), outside the <form> — so the harness
// renders it the way RecetaEditorPage does, via `form={RECIPE_EDITOR_FORM_ID}`.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// IngredientAutocomplete -> @/features/ingredients/api -> @/lib/supabase, which
// throws at module scope without env vars (green-local/red-CI trap otherwise).
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
const idleMutation = { mutateAsync: vi.fn(), isPending: false, reset: vi.fn() };
// What the ingredient search returns. A box, not a fresh literal per render: an
// unstable mock return is what turns a render into an infinite loop.
const { searchBox } = vi.hoisted(() => ({ searchBox: { results: [] as unknown[] } }));
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => ({ data: searchBox.results, isLoading: false }),
  // The table's footer always mounts IngredientAutocomplete → IngredientDialog,
  // which reaches for the rest of these.
  useOFFSearch: () => ({ data: [], isLoading: false }),
  useCreateManualIngredient: () => idleMutation,
  useImportFromOFF: () => idleMutation,
  useUpdateIngredient: () => idleMutation,
}));

import {
  RecipeEditorForm,
  recipeToEditorState,
  emptyEditorState,
  RECIPE_EDITOR_FORM_ID,
  type EditorState,
} from './RecipeEditorForm';
import type { Ingredient } from '@/features/ingredients/api';
import type { RecipeWithIngredients } from '../api';

function ingredient(): Ingredient {
  return {
    id: 'i-1',
    name: 'Pollo pechuga',
    name_en: null,
    brand: null,
    unit_type: 'gram',
    kcal_per_unit: 110,
    protein_g_per_unit: 22,
    carbs_g_per_unit: 0,
    fat_g_per_unit: 2,
    fiber_g_per_unit: 0,
    sugar_g_per_unit: 0,
    saturated_fat_g_per_unit: 0,
  } as unknown as Ingredient;
}

function secondIngredient(): Ingredient {
  return {
    id: 'i-2',
    name: 'Arroz blanco',
    name_en: null,
    brand: null,
    unit_type: 'gram',
    kcal_per_unit: 130,
    protein_g_per_unit: 2.7,
    carbs_g_per_unit: 28,
    fat_g_per_unit: 0.3,
    fiber_g_per_unit: 0.4,
    sugar_g_per_unit: 0,
    saturated_fat_g_per_unit: 0.1,
  } as unknown as Ingredient;
}

function recipe(over: Partial<RecipeWithIngredients> = {}): RecipeWithIngredients {
  return {
    id: 'r-1',
    created_at: '2026-06-01T00:00:00.000Z',
    created_by_user_id: 'u-1',
    description: null,
    instructions: null,
    meal_types: ['lunch'],
    name: 'Pollo con arroz',
    photo_url: null,
    prep_time_minutes: 35,
    servings: 4,
    updated_at: '2026-06-01T00:00:00.000Z',
    recipe_ingredients: [
      {
        id: 'ri-1',
        recipe_id: 'r-1',
        ingredient_id: 'i-1',
        quantity: 500,
        per_serving: false,
        display_order: 0,
        created_at: '2026-06-01T00:00:00.000Z',
        ingredient: ingredient(),
      },
    ],
    ...over,
  } as unknown as RecipeWithIngredients;
}

function renderForm(initial: EditorState) {
  const onSubmit = vi.fn();
  render(
    <>
      <RecipeEditorForm initial={initial} error={null} onSubmit={onSubmit} />
      {/* The page header's save button, verbatim: outside the form, owned by it. */}
      <button type="submit" form={RECIPE_EDITOR_FORM_ID}>
        Guardar
      </button>
    </>,
  );
  return onSubmit;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  searchBox.results = [];
});

describe('RecipeEditorForm — prep time survives a save', () => {
  it('hands the loaded prep time back to onSubmit when the user never touches the field', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // The whole point: NOT undefined, NOT '' — the value the recipe had.
    // `undefined`/`''` here means RecetaEditorPage sends p_prep_time_minutes:
    // null and the RPC wipes the column.
    expect(onSubmit.mock.calls[0][0].prepTime).toBe('35');
  });

  it('still submits after the user edits an unrelated field (prep time is not lost on re-render)', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 90 })));

    await user.type(screen.getByLabelText('Nombre'), ' v2');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0][0] as EditorState;
    expect(values.name).toBe('Pollo con arroz v2');
    expect(values.prepTime).toBe('90');
  });

  it('keeps an empty prep time empty (a recipe with no time recorded stays that way)', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: null })));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].prepTime).toBe('');
  });
});

// The rows rules (noIngredients / rowMissingIngredient / rowInvalidQuantity)
// all target the `rows` FIELD ARRAY, and react-hook-form parks an error aimed
// at the array itself under `errors.rows.root`. Reading only `errors.rows
// .message` found nothing: pressing Guardar on a recipe with no ingredients did
// nothing at all — no save, no message. See pickFirstError (src/lib/zod.ts).
describe('RecipeEditorForm — a rows error is actually shown', () => {
  it('shows the "add an ingredient" message instead of silently doing nothing', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ recipe_ingredients: [] })));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Añade al menos un ingrediente.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // The create page's shape after PR-B: emptyEditorState() seeds NO rows, so
  // this is the same array-level issue arriving through an empty field array.
  it("shows it on the create page's shape too (no rows at all)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(emptyEditorState());

    await user.type(screen.getByLabelText('Nombre'), 'Sin ingredientes');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Añade al menos un ingrediente.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // …and the case that actually exercises `errors.rows.root`: the rows field
  // array is REGISTERED (a row exists), so RHF parks the array-level issue on
  // `.root` rather than `.message`. Reading only `.message` made Guardar do
  // nothing at all here.
  it('shows the bad-quantity message when a registered row is emptied', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe()));

    await user.clear(screen.getByLabelText('Cantidad de Pollo pechuga'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hay filas con cantidad inválida o vacía.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('RecipeEditorForm — the prep-time input (R-33 wave 5 PR-B)', () => {
  it("shows the recipe's recorded prep time in the field", () => {
    renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));
    expect(screen.getByLabelText('Tiempo')).toHaveValue('35');
  });

  it('leaves the field empty when the recipe has no time recorded', () => {
    renderForm(recipeToEditorState(recipe({ prep_time_minutes: null })));
    expect(screen.getByLabelText('Tiempo')).toHaveValue('');
  });

  it('submits the edited value', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.type(screen.getByLabelText('Tiempo'), '50');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].prepTime).toBe('50');
  });

  it('clears the prep time when the user empties the field (an explicit "no time")', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].prepTime).toBe('');
  });

  // Before PR-B nobody could type this. Now they can — and unbounded it
  // overflows the column's int4 and surfaces a raw Postgres error.
  it('rejects an out-of-range prep time at the form boundary, with the localized message', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe({ prep_time_minutes: 35 })));

    await user.clear(screen.getByLabelText('Tiempo'));
    await user.type(screen.getByLabelText('Tiempo'), '99999999999');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El tiempo de preparación no puede superar las 24 h (1440 min).',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R-33 wave 5 PR-B, Task 2 — the ingredients table and the add flow.
//
// jsdom applies no CSS, so BOTH add affordances are in the DOM at once (the
// mobile button and the desktop search line are only ever hidden by a Tailwind
// `md:` class). Each test drives the one it means, by its own accessible name.
describe('RecipeEditorForm — the ingredients table', () => {
  it("renders a row per ingredient, with its name and quantity", () => {
    renderForm(recipeToEditorState(recipe()));

    expect(screen.getByText('Pollo pechuga')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad de Pollo pechuga')).toHaveValue(500);
  });

  it('says "en total" for a row that is not per_serving', () => {
    renderForm(recipeToEditorState(recipe()));

    const chip = screen.getByRole('button', { name: 'en total' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  // The chip carries TWO labels — the short one ("total") is the visible label
  // below `md`, the long one ("en total") from `md` up — and the hidden one is
  // `display:none`, so it is out of the accessibility tree. The name therefore
  // cannot come from the content: it must be an explicit aria-label, or the
  // chip announces as an unlabelled toggle on a phone. jsdom applies no CSS and
  // so resolves the name from the content either way — hence asserting the
  // attribute itself rather than trusting `getByRole({ name })` here.
  it('names itself with an explicit aria-label, not with its (breakpoint-hidden) text', () => {
    renderForm(recipeToEditorState(recipe()));

    expect(screen.getByRole('button', { name: 'en total' })).toHaveAttribute(
      'aria-label',
      'en total',
    );
  });

  it('shows the empty state — and no table — when the recipe has no ingredients', () => {
    renderForm(emptyEditorState());

    expect(screen.getByText('Aún no hay ingredientes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'en total' })).toBeNull();
  });
});

describe('RecipeEditorForm — the type chip flips per_serving in what gets saved', () => {
  it('toggles the row from "en total" to "por ración" and submits per_serving: true', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe()));

    await user.click(screen.getByRole('button', { name: 'en total' }));

    // The chip re-labels itself immediately…
    const chip = screen.getByRole('button', { name: 'por ración' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    // …and that is what the save carries.
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EditorState).rows[0].per_serving).toBe(true);
  });

  it('and back again', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(
      recipeToEditorState(
        recipe({
          recipe_ingredients: [
            {
              id: 'ri-1',
              recipe_id: 'r-1',
              ingredient_id: 'i-1',
              quantity: 50,
              per_serving: true,
              display_order: 0,
              created_at: '2026-06-01T00:00:00.000Z',
              ingredient: ingredient(),
            },
          ],
        } as unknown as Partial<RecipeWithIngredients>),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'por ración' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EditorState).rows[0].per_serving).toBe(false);
  });

  // The chip is not cosmetic: computeRecipeMacros multiplies a per_serving row's
  // quantity by the servings before it enters the total. 500 g of a 110 kcal/100 g
  // ingredient over 4 servings: 550 kcal "en total" → 2200 kcal "por ración".
  it('moves the live macros, because per_serving changes how the row aggregates', async () => {
    const user = userEvent.setup();
    renderForm(recipeToEditorState(recipe()));

    expect(screen.getAllByText('550').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'en total' }));

    await waitFor(() => expect(screen.getAllByText('2200').length).toBeGreaterThan(0));
  });
});

describe('RecipeEditorForm — removing a row (inline confirm, Cancelar on the outside)', () => {
  it('replaces the row with a confirm strip rather than deleting on the first tap', async () => {
    const user = userEvent.setup();
    renderForm(recipeToEditorState(recipe()));

    await user.click(
      screen.getByRole('button', { name: 'Quitar Pollo pechuga de la receta' }),
    );

    expect(screen.getByText('¿Quitar «Pollo pechuga»?')).toBeInTheDocument();
    // The row itself is gone from view — but nothing has been removed yet.
    expect(screen.queryByLabelText('Cantidad de Pollo pechuga')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('Cancelar puts the row back, untouched', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(recipeToEditorState(recipe()));

    await user.click(
      screen.getByRole('button', { name: 'Quitar Pollo pechuga de la receta' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByLabelText('Cantidad de Pollo pechuga')).toHaveValue(500);

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0][0] as EditorState).rows).toHaveLength(1);
  });

  it('confirming removes the row — and the live macros drop with it', async () => {
    const user = userEvent.setup();
    renderForm(recipeToEditorState(recipe()));

    expect(screen.getAllByText('550').length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole('button', { name: 'Quitar Pollo pechuga de la receta' }),
    );
    await user.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(screen.queryByText('Pollo pechuga')).toBeNull();
    expect(screen.getByText('Aún no hay ingredientes')).toBeInTheDocument();
    // Back to the macros card's empty variant.
    expect(
      screen.getAllByText('Los macros se calcularán a medida que añadas ingredientes.').length,
    ).toBeGreaterThan(0);
  });

  // The regression the rowId keying exists to prevent: confirming the SECOND
  // row's delete must remove the second row, not whichever row happens to sit
  // at some other index. Every other delete test in this file uses a single
  // -row fixture, so `removeRow(0)` hardcoded in place of `removeRow(index)`
  // would still pass all of them — this is the one that catches it.
  it('deletes the row that was confirmed, not the first one in the list', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(
      recipeToEditorState(
        recipe({
          recipe_ingredients: [
            {
              id: 'ri-1',
              recipe_id: 'r-1',
              ingredient_id: 'i-1',
              quantity: 500,
              per_serving: false,
              display_order: 0,
              created_at: '2026-06-01T00:00:00.000Z',
              ingredient: ingredient(),
            },
            {
              id: 'ri-2',
              recipe_id: 'r-1',
              ingredient_id: 'i-2',
              quantity: 200,
              per_serving: false,
              display_order: 1,
              created_at: '2026-06-01T00:00:00.000Z',
              ingredient: secondIngredient(),
            },
          ],
        } as unknown as Partial<RecipeWithIngredients>),
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Quitar Arroz blanco de la receta' }),
    );
    await user.click(screen.getByRole('button', { name: 'Quitar' }));

    // The second row is gone; the first survives, untouched.
    expect(screen.queryByText('Arroz blanco')).toBeNull();
    expect(screen.getByText('Pollo pechuga')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad de Pollo pechuga')).toHaveValue(500);

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const rows = (onSubmit.mock.calls[0][0] as EditorState).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].ingredient?.id).toBe('i-1');
  });
});

describe('RecipeEditorForm — adding an ingredient (web: the table footer)', () => {
  it('appends a row when a search result is picked, and the macros follow the quantity', async () => {
    const user = userEvent.setup();
    searchBox.results = [ingredient()];
    const onSubmit = renderForm(emptyEditorState());

    await user.type(
      screen.getByLabelText('Buscar ingrediente para añadirlo…'),
      'pollo',
    );
    await user.click(await screen.findByRole('button', { name: /Pollo pechuga/ }));

    // The row exists, empty-handed: the web footer carries no quantity, so you
    // type it into the row that just appeared — and it should already have
    // focus, so typing needs no click first. jsdom honours React's `autoFocus`,
    // so this is a real assertion, not a tautology of `user.type` itself.
    const qty = screen.getByLabelText('Cantidad de Pollo pechuga');
    expect(qty).toHaveValue(null);
    expect(qty).toHaveFocus();

    await user.type(qty, '200');

    // 200 g of a 110 kcal/100 g ingredient = 220 kcal in total.
    await waitFor(() => expect(screen.getAllByText('220').length).toBeGreaterThan(0));

    await user.type(screen.getByLabelText('Nombre'), 'Receta nueva');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const rows = (onSubmit.mock.calls[0][0] as EditorState).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].ingredient?.id).toBe('i-1');
    expect(rows[0].quantity).toBe('200');
    expect(rows[0].per_serving).toBe(false);
  });
});

describe('RecipeEditorForm — adding an ingredient (mobile: the bottom sheet)', () => {
  it('opens the sheet, adds the stepped quantity, and the live macros move at once', async () => {
    const user = userEvent.setup();
    searchBox.results = [ingredient()];
    const onSubmit = renderForm(emptyEditorState());

    await user.click(screen.getByRole('button', { name: 'Añadir ingrediente' }));

    const sheet = await screen.findByRole('dialog', { name: 'Añadir ingrediente' });
    await user.type(within(sheet).getByLabelText('Buscar en tu base…'), 'pollo');
    await user.click(await within(sheet).findByRole('button', { name: 'Elegir Pollo pechuga' }));

    // The default landing quantity for a per-100 g ingredient, and what it adds.
    expect(within(sheet).getByText('+110')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Aumentar la cantidad' }));
    expect(within(sheet).getByText('+121')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Añadir a la receta' }));

    // The sheet closed, the row landed WITH its quantity, macros moved.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByLabelText('Cantidad de Pollo pechuga')).toHaveValue(110);
    expect(screen.getAllByText('121').length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText('Nombre'), 'Receta nueva');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const rows = (onSubmit.mock.calls[0][0] as EditorState).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe('110');
  });
});
