import i18n from '@/i18n';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanificadorPage } from './PlanificadorPage';
import { ZERO_MACROS } from '@/features/recipes/macros';
import type { ActiveWeek } from '@/features/planner/api';

// Freeze "today" so the week is deterministic: Tue 2026-05-26 (week of Mon 05-25).
// shouldAdvanceTime lets userEvent's internal scheduling progress while the
// system clock stays pinned, matching MeasurementDialog/PhaseDialog's pattern.
vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(new Date('2026-05-26T09:00:00'));

afterAll(() => {
  vi.useRealTimers();
});

// RecipePeek pulls `ingredientDisplayName` from `@/features/ingredients/api`,
// which imports the Supabase client at module scope — that throws in a jsdom
// run with no VITE_SUPABASE_* env.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// jsdom implements no Pointer Capture API, and vaul's drawer (the mobile branch
// of every surface this page mounts) calls setPointerCapture on pointerdown.
// Without these stubs a click inside a drawer throws.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
}

// Distinct spies (not the shared noopMutation) so the add-vs-update and the
// replace-vs-append wiring are actually verifiable.
const {
  updateWeekSlotMutate,
  addWeekSlotMutate,
  copyWeekMealMutate,
  appendWeekMealMutate,
} = vi.hoisted(() => ({
  updateWeekSlotMutate: vi.fn().mockResolvedValue(undefined),
  addWeekSlotMutate: vi.fn().mockResolvedValue(undefined),
  copyWeekMealMutate: vi.fn().mockResolvedValue(undefined),
  appendWeekMealMutate: vi.fn().mockResolvedValue(undefined),
}));

const week: ActiveWeek = {
  id: 'w1',
  week_start: '2026-05-25',
  source_template_id: null,
  source_template_name: null,
  has_diverged: false,
  meal_times: ['08:00', '14:00'],
  slots: [
    {
      id: 's1',
      date: '2026-05-26',
      meal_index: 0,
      meal_time: '08:00',
      recipe_id: 'r1',
      recipe_name: 'Avena con plátano',
      servings: 1,
      display_order: 0,
      macros: { ...ZERO_MACROS, kcal: 318, proteinG: 12, carbsG: 55, fatG: 6 },
    },
  ],
};

// Divergent week: today carries an orphan slot at (meal_index: 2, meal_time:
// '10:00'); another day carries an orphan slot with the SAME meal_index but a
// DIFFERENT meal_time ('16:00') — reachable via per-day custom template times
// + apply_template_to_week's partial rewrite. This unions into two distinct
// (meal_index, meal_time) rows that both have meal_index 2, so a fix that
// filters entries by meal_index alone renders today's single slot under both.
const divergentWeek: ActiveWeek = {
  ...week,
  slots: [
    ...week.slots,
    {
      id: 's2',
      date: '2026-05-26',
      meal_index: 2,
      meal_time: '10:00',
      recipe_id: 'r2',
      recipe_name: 'Tortilla de espinacas',
      servings: 1,
      display_order: 0,
      macros: { ...ZERO_MACROS, kcal: 220, proteinG: 18, carbsG: 4, fatG: 15 },
    },
    {
      id: 's3',
      date: '2026-05-27',
      meal_index: 2,
      meal_time: '16:00',
      recipe_id: 'r3',
      recipe_name: 'Batido de proteína',
      servings: 1,
      display_order: 0,
      macros: { ...ZERO_MACROS, kcal: 180, proteinG: 25, carbsG: 8, fatG: 3 },
    },
  ],
};

// A week that also has a meal planned on Thursday (2026-05-28) — the day the
// mobile view could not reach before the week strip became selectable.
const weekWithThursday: ActiveWeek = {
  ...week,
  slots: [
    ...week.slots,
    {
      id: 's4',
      date: '2026-05-28',
      meal_index: 1,
      meal_time: '14:00',
      recipe_id: 'r4',
      recipe_name: 'Lentejas del jueves',
      servings: 1,
      display_order: 0,
      macros: { ...ZERO_MACROS, kcal: 540, proteinG: 30, carbsG: 60, fatG: 12 },
    },
  ],
};

let activeWeekData: ActiveWeek = week;

const noopMutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/features/planner/hooks', () => ({
  useActiveWeek: () => ({ data: activeWeekData, isLoading: false }),
  useAddWeekSlot: () => ({ mutateAsync: addWeekSlotMutate, isPending: false }),
  useUpdateWeekSlot: () => ({ mutateAsync: updateWeekSlotMutate, isPending: false }),
  useDeleteWeekSlot: () => noopMutation,
  useCopyWeekMeal: () => ({ mutateAsync: copyWeekMealMutate, isPending: false }),
  useAppendWeekMeal: () => ({ mutateAsync: appendWeekMealMutate, isPending: false }),
  useApplyTemplateToWeek: () => noopMutation,
  useSaveWeekAsTemplate: () => noopMutation,
  useWeekShopping: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/features/templates/hooks', () => ({
  useTemplates: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/planning/useDailyTarget', () => ({
  useDailyTarget: () => ({
    targets: { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 },
    phaseType: 'cut',
    proteinBasis: 'lean',
    weightKg: 80,
  }),
}));

// The add drawer reads the recipe library (name + per-serving macros); the peek
// reads one recipe in full.
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({
    data: [
      {
        id: 'r9',
        name: 'Pollo al horno',
        servings: 2,
        description: null,
        updated_at: '',
        ingredient_count: 3,
        meal_types: ['lunch'],
        labels: {},
        perServing: { kcal: 420, proteinG: 45, carbsG: 12, fatG: 20, fiberG: 2 },
      },
    ],
    isLoading: false,
  }),
  useRecipe: () => ({
    data: {
      id: 'r1',
      name: 'Avena con plátano',
      servings: 1,
      recipe_ingredients: [],
      // R-36: these tests exercise the peek's open/edit flow, not its steps
      // rendering — an empty array is the honest fixture (RecipePeek.test.tsx
      // owns the steps-rendering coverage).
      recipe_steps: [],
    },
    isLoading: false,
  }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlanificadorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mobileStack(container: HTMLElement) {
  return container.querySelector('[data-mobile-stack="today"]') as HTMLElement;
}

function webGrid(container: HTMLElement) {
  return container.querySelector('[data-web-grid]') as HTMLElement;
}

beforeAll(() => {
  void i18n.changeLanguage('es');
});

beforeEach(() => {
  updateWeekSlotMutate.mockClear();
  addWeekSlotMutate.mockClear();
  copyWeekMealMutate.mockClear();
  appendWeekMealMutate.mockClear();
  activeWeekData = week;
});

describe('PlanificadorPage', () => {
  it('renders the page title (twice — PageShell mounts both headers by design)', () => {
    renderPage();
    expect(screen.getAllByText('Planificador').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the web grid and the mobile stack together (CSS picks one)', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-day-header]').length).toBe(7); // grid
    expect(container.querySelectorAll('[data-day]').length).toBe(7); // mobile week strip
  });

  it('shows the planned recipe and the phase chip', () => {
    renderPage();
    expect(screen.getAllByText('Avena con plátano').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Corte').length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the shopping-list and template actions', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: /lista de la compra/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /guardar como plantilla/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the mobile shopping-cart button inside the mobile header stack (not just the desktop header)', () => {
    const { container } = renderPage();
    const mobileHeader = container.querySelector('[data-mobile-stack="header"]');
    expect(mobileHeader).not.toBeNull();
    expect(
      within(mobileHeader as HTMLElement).getByRole('button', { name: /lista de la compra/i }),
    ).toBeInTheDocument();
  });

  it('renders the mobile apply/save actions inside the mobile today stack (not just the desktop header)', () => {
    const { container } = renderPage();
    const mobileToday = container.querySelector('[data-mobile-stack="today"]');
    expect(mobileToday).not.toBeNull();
    const scope = within(mobileToday as HTMLElement);
    expect(scope.getByRole('button', { name: /aplicar plantilla/i })).toBeInTheDocument();
    expect(scope.getByRole('button', { name: /guardar como plantilla/i })).toBeInTheDocument();
  });

  it('does not duplicate a today slot across two rows sharing a meal_index but differing meal_time', () => {
    activeWeekData = divergentWeek;
    const { container } = renderPage();
    const mobileToday = container.querySelector('[data-mobile-stack="today"]') as HTMLElement;
    const scope = within(mobileToday);

    // today's orphan slot (meal_index 2, meal_time 10:00) must render exactly
    // once, not once per row that shares its meal_index.
    expect(scope.getAllByText('Tortilla de espinacas')).toHaveLength(1);
    // the other day's orphan slot (meal_index 2, meal_time 16:00) must not
    // leak into today's list at all — it belongs to 2026-05-27, not today.
    expect(scope.queryByText('Batido de proteína')).not.toBeInTheDocument();
  });
});

// One add drawer, one peek, one copy dialog — hoisted to the page. Both
// breakpoints raise the same intents; the page owns the surfaces.
describe('PlanificadorPage — add drawer', () => {
  it("opens the drawer on the grid cell's own destination and adds there", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    // First empty cell of the grid = Monday 25, breakfast (08:00): Tuesday's
    // breakfast is the only populated cell, and it offers "añadir" (add more),
    // not "añadir comida".
    const addButtons = within(webGrid(container)).getAllByRole('button', {
      name: /añadir comida/i,
    });
    await user.click(addButtons[0]);

    const destination = await screen.findByTestId('destination');
    expect(destination).toHaveTextContent(/lun 25/i);
    expect(destination).toHaveTextContent(/desayuno/i);
    expect(destination).toHaveTextContent(/08:00/);

    await user.click(screen.getByRole('button', { name: /pollo al horno/i }));
    await user.click(screen.getByRole('button', { name: /añadir a la comida/i }));

    await waitFor(() => expect(addWeekSlotMutate).toHaveBeenCalledTimes(1));
    expect(addWeekSlotMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_week_id: 'w1',
        date: '2026-05-25',
        meal_index: 0,
        meal_time: '08:00',
        recipe_id: 'r9',
        servings: 1,
      }),
    );
    expect(updateWeekSlotMutate).not.toHaveBeenCalled();
  });

  it('adds from the mobile list to the selected day, not to today', async () => {
    activeWeekData = weekWithThursday;
    const user = userEvent.setup();
    const { container } = renderPage();
    const stack = mobileStack(container);

    await user.click(stack.querySelector('[data-day="2026-05-28"]') as HTMLElement);
    await user.click(within(stack).getByRole('button', { name: /desayuno: añadir comida/i }));

    await user.click(await screen.findByRole('button', { name: /pollo al horno/i }));
    await user.click(screen.getByRole('button', { name: /añadir a la comida/i }));

    await waitFor(() => expect(addWeekSlotMutate).toHaveBeenCalledTimes(1));
    expect(addWeekSlotMutate).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-05-28', meal_index: 0, meal_time: '08:00', recipe_id: 'r9' }),
    );
  });
});

describe('PlanificadorPage — recipe peek', () => {
  it('opens the peek (not the editor) from a mobile plan row', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(
      within(mobileStack(container)).getByRole('button', { name: /avena con plátano/i }),
    );

    expect(await screen.findByRole('link', { name: /abrir receta/i })).toHaveAttribute(
      'href',
      '/recipes/r1',
    );
    // the add/edit drawer must NOT be what opened
    expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
  });

  it('opens the peek (not the editor) from a grid bullet', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(
      within(webGrid(container)).getByRole('button', { name: /avena con plátano/i }),
    );

    expect(await screen.findByRole('link', { name: /abrir receta/i })).toBeInTheDocument();
    expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
  });

  it("updates the existing entry (not add) through the peek's edit action", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(
      within(mobileStack(container)).getByRole('button', { name: /avena con plátano/i }),
    );
    await user.click(await screen.findByRole('button', { name: /^editar$/i }));

    // The drawer now carries the entry's own slot as its destination, in edit mode.
    expect(await screen.findByTestId('destination')).toHaveTextContent(/mar 26/i);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateWeekSlotMutate).toHaveBeenCalledTimes(1));
    expect(updateWeekSlotMutate).toHaveBeenCalledWith({
      id: 's1',
      patch: { recipe_id: 'r1', servings: 1 },
    });
    expect(addWeekSlotMutate).not.toHaveBeenCalled();
  });
});

describe('PlanificadorPage — copy modes', () => {
  async function openCopy(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
    await user.click(
      within(mobileStack(container)).getByRole('button', { name: /copiar comida a otros días/i }),
    );
    await user.click(await screen.findByRole('checkbox', { name: /^Miércoles/ }));
  }

  it('copies through the RPC in replace mode', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await openCopy(user, container);
    await user.click(screen.getByRole('button', { name: 'Copiar' }));

    await waitFor(() => expect(copyWeekMealMutate).toHaveBeenCalledTimes(1));
    expect(copyWeekMealMutate).toHaveBeenCalledWith({
      plan_week_id: 'w1',
      source_date: '2026-05-26',
      meal_index: 0,
      target_dates: ['2026-05-27'],
    });
    expect(appendWeekMealMutate).not.toHaveBeenCalled();
  });

  it('inserts rows through the append mutation in append mode — never the copy RPC', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await openCopy(user, container);
    await user.click(screen.getByRole('button', { name: /añadir junto/i }));
    await user.click(screen.getByRole('button', { name: 'Copiar' }));

    await waitFor(() => expect(appendWeekMealMutate).toHaveBeenCalledTimes(1));
    expect(appendWeekMealMutate).toHaveBeenCalledWith([
      {
        plan_week_id: 'w1',
        date: '2026-05-27',
        meal_index: 0,
        meal_time: '08:00',
        recipe_id: 'r1',
        servings: 1,
        display_order: 0,
      },
    ]);
    expect(copyWeekMealMutate).not.toHaveBeenCalled();
  });
});

// The mobile view is the ONLY editable surface below `md` (the week grid is
// `hidden md:block`), so the week strip has to be able to move the list off
// today — otherwise Thursday's dinner is unreachable from a phone.
describe('PlanificadorPage — mobile day selection', () => {
  it('defaults the mobile list to today', () => {
    activeWeekData = weekWithThursday;
    const { container } = renderPage();
    const scope = within(mobileStack(container));

    expect(scope.getByText('Hoy · Mar 26')).toBeInTheDocument();
    expect(scope.getByText('Avena con plátano')).toBeInTheDocument();
    expect(scope.queryByText('Lentejas del jueves')).not.toBeInTheDocument();
  });

  it('moves the mobile list, its heading and its totals to the day picked in the strip', async () => {
    activeWeekData = weekWithThursday;
    const user = userEvent.setup();
    const { container } = renderPage();
    const stack = mobileStack(container);

    await user.click(stack.querySelector('[data-day="2026-05-28"]') as HTMLElement);

    const scope = within(stack);
    expect(scope.getByText('Jue 28')).toBeInTheDocument();
    expect(scope.queryByText(/^Hoy ·/)).not.toBeInTheDocument();
    expect(scope.getByText('Lentejas del jueves')).toBeInTheDocument();
    expect(scope.queryByText('Avena con plátano')).not.toBeInTheDocument();
    // Day totals readout follows the selection (Thursday = 540 kcal, today = 318).
    expect(scope.getByText('540 / 2180 kcal')).toBeInTheDocument();
  });

  it('copies the meal of the selected day, not of today', async () => {
    activeWeekData = weekWithThursday;
    const user = userEvent.setup();
    const { container } = renderPage();
    const stack = mobileStack(container);

    await user.click(stack.querySelector('[data-day="2026-05-28"]') as HTMLElement);
    await user.click(within(stack).getByRole('button', { name: /copiar comida a otros días/i }));

    // The copy dialog offers every day EXCEPT its source. Thursday is the
    // selected day, so it must be the one missing from the targets — asserting
    // on the source label alone would pass even if the source were still today.
    expect(await screen.findByRole('checkbox', { name: /^Martes/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Jueves/ })).not.toBeInTheDocument();
  });
});
