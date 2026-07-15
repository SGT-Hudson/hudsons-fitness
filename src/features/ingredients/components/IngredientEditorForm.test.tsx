// @vitest-environment jsdom
//
// R-33 wave 6 PR-B — the ingredient editor's BODY (Task 2).
//
// What this pins, and why each one is here rather than in a Tier-1 test:
//
//  1. **The submit branch.** `offProduct` set ⇒ `importIngredientFromOFF`
//     (source='openfoodfacts' + external_id); unset ⇒ `createManualIngredient`;
//     an `ingredient` ⇒ `updateIngredient`. Get this wrong and a scanned product
//     saves as a manual row with no EAN — invisible, unrecoverable data loss.
//  2. **The auto-kcal state machine.** Derivation is Tier-1 (`core/autoKcal`);
//     what only a component test can see is WHEN it runs: it must stop the
//     moment the user types a kcal, come back on demand, and NEVER overwrite an
//     OFF kcal (which routinely disagrees with Atwater by ±20%).
//  3. **The salt round trip** through the real RHF + zod boundary: a `null`
//     (unknown) salt renders blank and goes back as `null`, never `0`.
//  4. **The preview card** recomputes from `watch()` — it is the only surface
//     that shows the user what they are about to store.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The component's import graph reaches `@/lib/supabase` (via ../api types and
// ../hooks), which throws at module load without VITE_SUPABASE_* — green
// locally, red in CI. Stub it, and stub the three mutations it branches on.
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

import {
  IngredientEditorForm,
  INGREDIENT_EDITOR_FORM_ID,
  type IngredientEditorFormProps,
} from './IngredientEditorForm';
import type { Ingredient } from '../api';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

function ingredient(over: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'i-1',
    name: 'Yogur natural griego',
    name_en: null,
    brand: 'Pascual',
    source: 'openfoodfacts',
    external_id: '8410530305012',
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

// Atwater over these macros is 4·4.5 + 4·4.2 + 9·9.7 = 122 kcal — deliberately
// NOT the 116 OFF reports. That gap is the whole point of Constraint 4.
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

function renderEditor(props: IngredientEditorFormProps = {}) {
  render(
    <>
      <IngredientEditorForm {...props} />
      {/* Both consuming surfaces (the page header, the dialog footer) keep the
          save button OUTSIDE the form and submit it by id. Render it the way
          they will. */}
      <button type="submit" form={INGREDIENT_EDITOR_FORM_ID}>
        Guardar
      </button>
    </>,
  );
}

const save = () => screen.getByRole('button', { name: 'Guardar' });
const kcalField = () => screen.getByLabelText('Calorías') as HTMLInputElement;
const autoChip = () => screen.queryByText('auto');
const preview = () => screen.getByRole('region', { name: 'Vista previa' });

/**
 * Take kcal over. The field is always editable (a product decision); typing a
 * real keystroke into it is what flips the mode to manual — no unlock pill.
 */
async function overrideKcal(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.clear(kcalField());
  await user.type(kcalField(), value);
}

/** Fill the three primaries a manual create needs (kcal is derived from them). */
async function fillMacros(
  user: ReturnType<typeof userEvent.setup>,
  { protein = '10', carbs = '20', fat = '5' } = {},
) {
  await user.type(screen.getByLabelText('Proteínas'), protein);
  await user.type(screen.getByLabelText('Carbohidratos'), carbs);
  await user.type(screen.getByLabelText('Grasas'), fat);
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  createMut.mutateAsync.mockReset().mockResolvedValue(ingredient({ id: 'new-1' }));
  importMut.mutateAsync.mockReset().mockResolvedValue(ingredient({ id: 'new-2' }));
  updateMut.mutateAsync.mockReset().mockResolvedValue(ingredient());
});

describe('auto-kcal', () => {
  it('derives kcal from protein/carbs/fat while you type, on a blank manual create', async () => {
    const user = userEvent.setup();
    renderEditor();

    // Blank form: nothing typed, nothing derived yet.
    expect(kcalField()).toHaveValue('0');
    expect(autoChip()).toBeInTheDocument();

    await user.type(screen.getByLabelText('Proteínas'), '10');
    await waitFor(() => expect(kcalField()).toHaveValue('40')); // 4·10

    await user.type(screen.getByLabelText('Carbohidratos'), '20');
    await waitFor(() => expect(kcalField()).toHaveValue('120')); // + 4·20

    await user.type(screen.getByLabelText('Grasas'), '5');
    await waitFor(() => expect(kcalField()).toHaveValue('165')); // + 9·5

    // Still auto: the field is the derivation's, not the user's.
    expect(autoChip()).toBeInTheDocument();
  });

  it('flips to manual the moment the user types into kcal — the chip goes and auto stops overwriting', async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillMacros(user);
    await waitFor(() => expect(kcalField()).toHaveValue('165'));

    await overrideKcal(user, '200');

    expect(autoChip()).not.toBeInTheDocument();
    await waitFor(() => expect(kcalField()).toHaveValue('200'));

    // The derivation must not claw it back on the next macro keystroke.
    await user.type(screen.getByLabelText('Proteínas'), '5'); // 10 → 105
    await waitFor(() => expect(screen.getByLabelText('Proteínas')).toHaveValue('105'));
    expect(kcalField()).toHaveValue('200');
  });

  it('does NOT flip on a click or focus alone — only an actual keystroke does', async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillMacros(user);
    await waitFor(() => expect(kcalField()).toHaveValue('165'));

    kcalField().focus();
    await user.click(kcalField());
    expect(autoChip()).toBeInTheDocument();

    // The first real keystroke does flip it.
    await user.type(kcalField(), '0');
    expect(autoChip()).not.toBeInTheDocument();
  });

  it('"volver a automático" gives the derivation back', async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillMacros(user);
    await overrideKcal(user, '200');
    expect(autoChip()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver a automático' }));

    await waitFor(() => expect(kcalField()).toHaveValue('165'));
    expect(autoChip()).toBeInTheDocument();
  });

  it('never auto-overwrites an OFF kcal: an OFF-seeded form starts MANUAL (Constraint 4)', async () => {
    const user = userEvent.setup();
    renderEditor({ offProduct: offResult() });

    // OFF says 116; Atwater over the same macros says 122. The label is the truth.
    expect(kcalField()).toHaveValue('116');
    expect(autoChip()).not.toBeInTheDocument();

    // Editing a macro must not re-derive over it either.
    await user.clear(screen.getByLabelText('Proteínas'));
    await user.type(screen.getByLabelText('Proteínas'), '5');
    await waitFor(() => expect(screen.getByLabelText('Proteínas')).toHaveValue('5'));
    expect(kcalField()).toHaveValue('116');
  });

  it('starts MANUAL when editing a stored row (a stored kcal is just a number)', () => {
    renderEditor({ ingredient: ingredient({ source: 'manual', external_id: null }) });

    expect(kcalField()).toHaveValue('116');
    expect(autoChip()).not.toBeInTheDocument();
  });
});

describe('the submit branch (Constraint 2)', () => {
  it('a blank create saves through createManualIngredient', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderEditor({ onSaved });

    await user.type(screen.getByLabelText('Nombre'), 'Copos de avena');
    await fillMacros(user, { protein: '13', carbs: '58', fat: '7' });
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(importMut.mutateAsync).not.toHaveBeenCalled();
    expect(updateMut.mutateAsync).not.toHaveBeenCalled();
    expect(createMut.mutateAsync.mock.calls[0][0]).toMatchObject({
      name: 'Copos de avena',
      brand: null,
      unit_type: 'gram',
      kcal_per_unit: 347, // 4·13 + 4·58 + 9·7
      protein_g_per_unit: 13,
      carbs_g_per_unit: 58,
      fat_g_per_unit: 7,
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-1' }));
  });

  it('an OFF-seeded create imports (source=openfoodfacts + the EAN), it does NOT create a manual row', async () => {
    const user = userEvent.setup();
    const product = offResult();
    renderEditor({ offProduct: product });

    await user.click(save());

    await waitFor(() => expect(importMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(createMut.mutateAsync).not.toHaveBeenCalled();
    // The product itself must travel — `importIngredientFromOFF` reads
    // `product.code` for `external_id`. Losing it here is the silent regression.
    const arg = importMut.mutateAsync.mock.calls[0][0];
    expect(arg.product).toBe(product);
    expect(arg.overrides).toMatchObject({
      name: 'Yogur natural griego',
      brand: 'Pascual',
      kcal_per_unit: 116,
      salt_g_per_unit: null,
    });
  });

  it('an edit updates the row it was given', async () => {
    const user = userEvent.setup();
    renderEditor({ ingredient: ingredient() });

    await user.clear(screen.getByLabelText('Nombre'));
    await user.type(screen.getByLabelText('Nombre'), 'Yogur griego 0%');
    await user.click(save());

    await waitFor(() => expect(updateMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(createMut.mutateAsync).not.toHaveBeenCalled();
    expect(importMut.mutateAsync).not.toHaveBeenCalled();
    const arg = updateMut.mutateAsync.mock.calls[0][0];
    expect(arg.id).toBe('i-1');
    expect(arg.patch).toMatchObject({ name: 'Yogur griego 0%', kcal_per_unit: 116 });
  });

  it('refuses a second submit while the first is in flight (no double create)', async () => {
    const user = userEvent.setup();
    createMut.isPending = true; // the mutation the first click started
    try {
      renderEditor();
      await user.type(screen.getByLabelText('Nombre'), 'Copos de avena');
      await fillMacros(user);
      await user.click(save());

      expect(createMut.mutateAsync).not.toHaveBeenCalled();
    } finally {
      createMut.isPending = false;
    }
  });

  it('blocks the save and says why when the name is missing', async () => {
    const user = userEvent.setup();
    renderEditor();

    await fillMacros(user);
    await user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('nombre');
    expect(createMut.mutateAsync).not.toHaveBeenCalled();
  });
});

// The decimal-comma fix. A Spanish keyboard puts `,` on the numeric keypad, so
// `8,5` is what a user types by default — and `<input type="number">` STRIPS the
// comma before React sees it (`"85"`). userEvent reproduces that in jsdom, so
// these go red against the old `type="number"` MacroField, and red again if the
// schema stops parsing the comma. They assert the SUBMITTED PAYLOAD, never the
// field's own value — the field's value is exactly what lies.
describe('the decimal comma', () => {
  it('stores 8,5 g of protein as 8.5 — and the auto-kcal derivation reads it too', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByLabelText('Nombre'), 'Copos de avena');
    await user.type(screen.getByLabelText('Proteínas'), '8,5');
    await user.type(screen.getByLabelText('Carbohidratos'), '0');
    await user.type(screen.getByLabelText('Grasas'), '0');
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(createMut.mutateAsync.mock.calls[0][0]).toMatchObject({
      protein_g_per_unit: 8.5,
      kcal_per_unit: 34, // 4 · 8.5 — NaN or 340 if the comma were lost
    });
  });

  it('stores a comma typed into kcal — and typing it still flips auto → manual', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByLabelText('Nombre'), 'Copos de avena');
    await fillMacros(user);
    await overrideKcal(user, '82,4');

    expect(autoChip()).not.toBeInTheDocument();
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(createMut.mutateAsync.mock.calls[0][0].kcal_per_unit).toBe(82.4);
  });

  it('stores a comma typed into an optional sub-macro (1,2 g of salt)', async () => {
    const user = userEvent.setup();
    renderEditor({ ingredient: ingredient() });

    await user.type(screen.getByLabelText('Sal'), '1,2');
    await user.click(save());

    await waitFor(() => expect(updateMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMut.mutateAsync.mock.calls[0][0].patch.salt_g_per_unit).toBe(1.2);
  });
});

// `type="text"` drops the native `required` gate, so zod owns it now — and it
// MUST, because a blank macro parses to 0: without this rule a blank protein
// would save silently as 0 g.
describe('the blank-macro gate (zod, not the browser)', () => {
  it('blocks the save and says why when a macro is left blank', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByLabelText('Nombre'), 'Copos de avena');
    await user.type(screen.getByLabelText('Carbohidratos'), '58');
    await user.type(screen.getByLabelText('Grasas'), '7');
    // Proteínas left blank.
    await user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('obligatorios');
    expect(createMut.mutateAsync).not.toHaveBeenCalled();
  });

  it('still lets a blank optional sub-macro through as null (blank = unknown, not missing)', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByLabelText('Nombre'), 'Copos de avena');
    await fillMacros(user);
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(createMut.mutateAsync.mock.calls[0][0]).toMatchObject({
      sugar_g_per_unit: null,
      saturated_fat_g_per_unit: null,
      salt_g_per_unit: null,
      fiber_g_per_unit: 0, // fiber's blank is a 0, not an unknown — unchanged
    });
  });
});

describe('salt (null = unknown, never 0)', () => {
  it('renders a null salt as a BLANK field and sends it back as null', async () => {
    const user = userEvent.setup();
    renderEditor({ ingredient: ingredient({ salt_g_per_unit: null }) });

    expect(screen.getByLabelText('Sal')).toHaveValue('');

    await user.click(save());

    await waitFor(() => expect(updateMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMut.mutateAsync.mock.calls[0][0].patch.salt_g_per_unit).toBeNull();
  });

  it('round-trips a real salt figure (including a genuine 0)', async () => {
    const user = userEvent.setup();
    renderEditor({ ingredient: ingredient({ salt_g_per_unit: 0 }) });

    expect(screen.getByLabelText('Sal')).toHaveValue('0');

    await user.clear(screen.getByLabelText('Sal'));
    await user.type(screen.getByLabelText('Sal'), '1.2');
    await user.click(save());

    await waitFor(() => expect(updateMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMut.mutateAsync.mock.calls[0][0].patch.salt_g_per_unit).toBe(1.2);
  });
});

describe('the live preview card', () => {
  it('tracks the form on every keystroke', async () => {
    const user = userEvent.setup();
    renderEditor();

    // Empty: a placeholder name and an em dash, not a wall of zeroes.
    expect(within(preview()).getByText('Nombre del ingrediente')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre'), 'Copos de avena');
    await user.type(screen.getByLabelText(/Marca/), 'Hacendado');
    await fillMacros(user, { protein: '13', carbs: '58', fat: '7' });

    const card = preview();
    expect(within(card).getByText('Copos de avena')).toBeInTheDocument();
    expect(within(card).getByText('Hacendado')).toBeInTheDocument();
    // The big kcal — the derived one, live.
    expect(within(card).getByText('347')).toBeInTheDocument();
    expect(within(card).getByText('13 g')).toBeInTheDocument();
    expect(within(card).getByText('58 g')).toBeInTheDocument();
    expect(within(card).getByText('7 g')).toBeInTheDocument();
    // Reparto calórico: 52 kcal P / 232 kcal C / 63 kcal G over 347.
    expect(within(card).getByText(/15\s*%/)).toBeInTheDocument(); // P
    expect(within(card).getByText(/67\s*%/)).toBeInTheDocument(); // C
    expect(within(card).getByText(/18\s*%/)).toBeInTheDocument(); // G
  });

  it('shows the row as it will look in the library: the source badge follows the origin', () => {
    renderEditor({ offProduct: offResult() });
    expect(within(preview()).getByLabelText('Importado de OpenFoodFacts')).toBeInTheDocument();
  });

  it('splits by the derived (Atwater) kcal, not an overridden kcal field — they can disagree', () => {
    // protein 4.5 / carbs 4.2 / fat 9.7 g → Atwater ≈ 122 kcal. The stored
    // kcal is overridden to 500, wildly disagreeing with it. If the split's
    // denominator were `Number(kcal)` instead of `deriveAutoKcal(...)`, these
    // percentages would read 4 % / 3 % / 17 % instead.
    renderEditor({ ingredient: ingredient({ kcal_per_unit: 500 }) });

    const card = preview();
    expect(within(card).getByText(/15\s*%/)).toBeInTheDocument(); // P: 18/122
    expect(within(card).getByText(/14\s*%/)).toBeInTheDocument(); // C: 16.8/122
    expect(within(card).getByText(/72\s*%/)).toBeInTheDocument(); // F: 87.3/122
  });
});

describe('origin + the OFF caveat', () => {
  it('shows the origin card with the EAN when editing an OFF row', () => {
    renderEditor({ ingredient: ingredient() });

    expect(screen.getByText('Origen del dato')).toBeInTheDocument();
    expect(screen.getByText('8410530305012')).toBeInTheDocument();
    expect(screen.getByText(/compáralos con tu envase/)).toBeInTheDocument();
  });

  it('shows no EAN and no caveat for a manual row', () => {
    renderEditor({ ingredient: ingredient({ source: 'manual', external_id: null }) });

    expect(screen.getByText('Origen del dato')).toBeInTheDocument();
    expect(screen.queryByText('8410530305012')).not.toBeInTheDocument();
    expect(screen.queryByText(/compáralos con tu envase/)).not.toBeInTheDocument();
  });

  it('warns about OFF values on an OFF-seeded create too (before the row exists)', () => {
    renderEditor({ offProduct: offResult() });
    expect(screen.getByText(/compáralos con tu envase/)).toBeInTheDocument();
  });
});

describe('the unit segmented control', () => {
  it('switches the macro basis to "por unidad"', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByLabelText('Nombre'), 'Huevo M');
    await user.click(screen.getByRole('radio', { name: /por unidad/ }));
    await fillMacros(user, { protein: '6', carbs: '0', fat: '5' });
    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(createMut.mutateAsync.mock.calls[0][0].unit_type).toBe('unit');
  });
});
