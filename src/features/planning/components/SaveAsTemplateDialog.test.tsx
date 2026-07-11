import i18n from '@/i18n';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';
import type { GridSlot } from '@/features/templates/filledGrid';

const slots: GridSlot[] = [
  { day_of_week: 0, meal_index: 0 },
  { day_of_week: 2, meal_index: 1 },
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
    mealTimes: ['08:00:00', '13:00:00'],
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
