import i18n from '@/i18n';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanificadorPage } from './PlanificadorPage';
import { ZERO_MACROS } from '@/features/recipes/macros';
import type { ActiveWeek } from '@/features/planner/api';

// This file isolates ONE thing: the add-drawer/peek must not lose their
// content the instant a close is requested (R-33 wave 3 visual QA fix).
//
// The real regression lived in vaul/Radix's exit animation — `data-state`
// should go open -> closed (element still in the DOM) and only THEN unmount,
// ~400ms later, exactly like `CopyMealDialog` already does. That timing is
// driven by a CSS animationend event, which jsdom does not fire (its
// `getComputedStyle` never resolves the stylesheet's `animation-name`), so
// Radix's Presence takes its no-animation-detected branch and unmounts
// synchronously regardless of this fix — confirmed by probing
// `document.querySelector('[data-vaul-drawer]')` immediately after a
// `onOpenChange(false)` call, which read `null` even with the fix applied.
// That is a jsdom limitation, not something this suite can observe.
//
// What IS observable — and is the actual mechanism the fix relies on — is the
// contract one level up, inside `PlanificadorPage` itself: closing must only
// flip the `open` prop; the CONTENT prop (`target`/`editing`/`recipeId`) must
// keep the last real payload instead of going stale/undefined the same tick.
// Stubbing `AddRecipeDrawer`/`RecipePeek` lets this suite watch exactly that,
// unclouded by vaul/Radix's jsdom-only animation gap.
vi.mock('@/features/planning/components/AddRecipeDrawer', () => ({
  AddRecipeDrawer: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: { date: string; mealIndex: number };
    editing?: { id: string };
  }) => (
    <div data-testid="add-drawer-stub" data-open={String(props.open)}>
      <span data-testid="add-drawer-content">
        {props.target.date}|{props.target.mealIndex}|{props.editing?.id ?? 'new'}
      </span>
      <button type="button" onClick={() => props.onOpenChange(false)}>
        stub-close-add
      </button>
    </div>
  ),
}));

vi.mock('@/features/planning/components/RecipePeek', () => ({
  RecipePeek: (props: { open: boolean; onOpenChange: (open: boolean) => void; recipeId: string }) => (
    <div data-testid="peek-stub" data-open={String(props.open)}>
      <span data-testid="peek-stub-content">{props.recipeId}</span>
      <button type="button" onClick={() => props.onOpenChange(false)}>
        stub-close-peek
      </button>
    </div>
  ),
}));

vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(new Date('2026-05-26T09:00:00'));

afterAll(() => {
  vi.useRealTimers();
});

const noopMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };

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

vi.mock('@/features/planner/hooks', () => ({
  useActiveWeek: () => ({ data: week, isLoading: false }),
  useAddWeekSlot: () => noopMutation,
  useUpdateWeekSlot: () => noopMutation,
  useDeleteWeekSlot: () => noopMutation,
  useCopyWeekMeal: () => noopMutation,
  useAppendWeekMeal: () => noopMutation,
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

function webGrid(container: HTMLElement) {
  return container.querySelector('[data-web-grid]') as HTMLElement;
}

function mobileStack(container: HTMLElement) {
  return container.querySelector('[data-mobile-stack="today"]') as HTMLElement;
}

beforeAll(() => {
  void i18n.changeLanguage('es');
});

beforeEach(() => {
  noopMutation.mutateAsync.mockClear();
});

describe('PlanificadorPage — add drawer keeps its content through close', () => {
  it('retains the last target/editing payload — present, open=false — instead of going stale the instant close is requested', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    const addButtons = within(webGrid(container)).getAllByRole('button', { name: /añadir comida/i });
    await user.click(addButtons[0]); // Monday 25, breakfast (08:00)

    expect(screen.getByTestId('add-drawer-stub')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('add-drawer-content')).toHaveTextContent('2026-05-25|0|new');

    await user.click(screen.getByRole('button', { name: 'stub-close-add' }));

    // The bug: `{addTarget && <AddRecipeDrawer .../>}` nulled `addTarget` in
    // the SAME commit as the close, unmounting the whole node — this
    // `getByTestId` would throw. The fix: `addTarget` (content) is untouched
    // by a close, only `addOpen` flips — so the stub stays mounted, still
    // showing Monday breakfast's payload, just with open=false.
    expect(screen.getByTestId('add-drawer-stub')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('add-drawer-content')).toHaveTextContent('2026-05-25|0|new');
  });

  it('never leaks the closing slot’s content into the next slot opened', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    const addButtons = within(webGrid(container)).getAllByRole('button', { name: /añadir comida/i });
    await user.click(addButtons[0]); // Monday 25, breakfast
    await user.click(screen.getByRole('button', { name: 'stub-close-add' }));
    expect(screen.getByTestId('add-drawer-content')).toHaveTextContent('2026-05-25|0|new');

    // Reopen on a DIFFERENT cell — its content must be entirely the new
    // target's, never a frame of the previous (closed) one.
    const addButtonsAfter = within(webGrid(container)).getAllByRole('button', { name: /añadir comida/i });
    await user.click(addButtonsAfter[1]);

    expect(screen.getByTestId('add-drawer-stub')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('add-drawer-content')).not.toHaveTextContent('2026-05-25|0|new');
  });
});

describe('PlanificadorPage — recipe peek keeps its content through close', () => {
  it('retains the peeked recipe id — present, open=false — instead of unmounting on close', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(within(mobileStack(container)).getByRole('button', { name: /avena con plátano/i }));
    expect(screen.getByTestId('peek-stub')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('peek-stub-content')).toHaveTextContent('r1');

    await user.click(screen.getByRole('button', { name: 'stub-close-peek' }));

    expect(screen.getByTestId('peek-stub')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('peek-stub-content')).toHaveTextContent('r1');
  });
});
