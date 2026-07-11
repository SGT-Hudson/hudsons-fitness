import i18n from '@/i18n';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';
import type { PreviewSlot } from '../templatePreview';

const slots: PreviewSlot[] = [
  { day_of_week: 0, meal_index: 0, meal_time: '08:00:00' },
  { day_of_week: 0, meal_index: 1, meal_time: '13:00:00' },
  { day_of_week: 2, meal_index: 1, meal_time: '13:00:00' },
];

beforeAll(() => {
  void i18n.changeLanguage('es');
});

// jsdom has no matchMedia; ResponsiveDialog needs one. Drive the breakpoint.
function setViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: isDesktop,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setViewport(true);
});

function renderDialog(over: Partial<Parameters<typeof SaveAsTemplateDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    weekStart: '2026-06-01',
    slots,
    activePhase: null,
    onSave: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return {
    props,
    ...render(
      <MemoryRouter>
        <SaveAsTemplateDialog {...props} />
      </MemoryRouter>,
    ),
  };
}

describe('SaveAsTemplateDialog', () => {
  it('defaults the picker to the user\'s active phase', () => {
    renderDialog({ activePhase: 'cut' });
    expect(screen.getByRole('radio', { name: 'Corte' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Sin fase' })).toHaveAttribute('aria-checked', 'false');
  });

  it('defaults to "sin fase" when the user has no active phase', () => {
    renderDialog({ activePhase: null });
    expect(screen.getByRole('radio', { name: 'Sin fase' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sends the picked phase to onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onSave, activePhase: null });

    await user.click(screen.getByRole('radio', { name: 'Volumen' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).toHaveBeenCalledWith(expect.any(String), 'bulk');
  });

  it('sending "sin fase" reaches onSave as null, not a default phase', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onSave, activePhase: 'cut' });

    await user.click(screen.getByRole('radio', { name: 'Sin fase' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).toHaveBeenCalledWith(expect.any(String), null);
  });

  it('retints the live preview card when the phase changes', async () => {
    const user = userEvent.setup();
    renderDialog({ activePhase: null });
    const preview = screen.getByTestId('save-template-preview');

    expect(preview.querySelector('[data-phase-strip="none"]')).toBeInTheDocument();
    expect(within(preview).queryByText('Corte')).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Corte' }));

    expect(preview.querySelector('[data-phase-strip="cut"]')).toBeInTheDocument();
    expect(within(preview).getByText('Corte')).toBeInTheDocument();
  });

  // The preview must promise exactly what `save_week_as_template` will create:
  // its default_meal_times come from MONDAY's distinct slot times, never from
  // the (possibly deleted, possibly wider) source template's.
  it("draws the preview grid from Monday's meal times", () => {
    renderDialog();
    const preview = screen.getByTestId('save-template-preview');
    expect(preview.querySelectorAll('[data-dot]').length).toBe(14); // 7 days × 2 meals
    expect(within(preview).getByText(/2 comidas\/día/)).toBeInTheDocument();
  });

  // source_template_id is ON DELETE SET NULL — the week keeps its slots but
  // reports no template meal times. The preview must still show Monday's grid.
  it('still previews a full grid when the source template was deleted', () => {
    renderDialog({
      slots: [
        { day_of_week: 0, meal_index: 0, meal_time: '07:30:00' },
        { day_of_week: 0, meal_index: 1, meal_time: '12:15:00' },
        { day_of_week: 0, meal_index: 2, meal_time: '20:00:00' },
        { day_of_week: 4, meal_index: 1, meal_time: '12:15:00' },
      ],
    });
    const preview = screen.getByTestId('save-template-preview');
    expect(preview.querySelectorAll('[data-dot]').length).toBe(21); // 7 days × 3 meals
    expect(preview.querySelectorAll('[data-dot="on"]').length).toBe(4);
    expect(within(preview).getByText(/3 comidas\/día/)).toBeInTheDocument();
  });

  // Monday planned with fewer meals than the source template offered: the RPC
  // derives 1 meal, so a 4-row preview would be a lie.
  it("shrinks the preview to Monday's real meal count", () => {
    renderDialog({ slots: [{ day_of_week: 0, meal_index: 0, meal_time: '08:00:00' }] });
    const preview = screen.getByTestId('save-template-preview');
    expect(preview.querySelectorAll('[data-dot]').length).toBe(7); // 7 days × 1 meal
    expect(within(preview).getByText(/1 comida\/día/)).toBeInTheDocument();
  });

  // The preview is a picture, not a card you can act on: an aria-hidden +
  // pointer-events-none wrapper still left its Link/edit/delete in the tab
  // order (Enter navigated away from the planner), and focusable content inside
  // an aria-hidden subtree is an axe violation. Nothing focusable is rendered.
  it('renders the preview card with no reachable controls', () => {
    renderDialog();
    const preview = screen.getByTestId('save-template-preview');
    expect(preview.querySelectorAll('a, button, [tabindex]')).toHaveLength(0);
    expect(preview.closest('[aria-hidden="true"]')).toBeNull();
    expect(within(preview).queryByRole('link')).toBeNull();
  });

  // vaul draws no close affordance of its own, so the mobile branch would be
  // dismissible only by dragging it without an explicit control.
  it('offers a Cancel control on mobile that closes the dialog', async () => {
    setViewport(false);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('leaves the Cancel control to radix on desktop', () => {
    renderDialog();
    // The desktop DialogContent draws its own X — a second control would be noise.
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });
});
