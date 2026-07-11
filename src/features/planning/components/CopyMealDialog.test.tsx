import i18n from '@/i18n';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyMealDialog, type CopyTarget } from './CopyMealDialog';

const targets: CopyTarget[] = [
  { key: 'tue', label: 'Martes', sublabel: '27 may', willOverwrite: true },
  { key: 'wed', label: 'Miércoles', sublabel: '28 may', willOverwrite: false },
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

function renderDialog(over: Partial<Parameters<typeof CopyMealDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    sourceLabel: 'Desayuno (08:00) · lunes',
    entryNames: ['Tortilla francesa'],
    targets,
    onConfirm: vi.fn(),
    allowAppend: true,
    ...over,
  };
  return { props, ...render(<CopyMealDialog {...props} />) };
}

describe('CopyMealDialog', () => {
  it('renders the panel inside the dialog shell', () => {
    renderDialog();
    expect(screen.getByText('Desayuno (08:00) · lunes')).toBeInTheDocument();
    expect(screen.getByText('Tortilla francesa')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Martes/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('resets its selection when reopened', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog();

    await user.click(screen.getByRole('checkbox', { name: /Martes/ }));
    expect(screen.getByRole('checkbox', { name: /Martes/ })).toHaveAttribute('aria-checked', 'true');

    rerender(<CopyMealDialog {...props} open={false} />);
    rerender(<CopyMealDialog {...props} open />);

    expect(screen.getByRole('checkbox', { name: /Martes/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('hands the selected keys and mode to onConfirm, then closes', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onConfirm, onOpenChange });

    await user.click(screen.getByRole('checkbox', { name: /Martes/ }));
    await user.click(screen.getByRole('button', { name: /añadir junto/i }));
    await user.click(screen.getByRole('button', { name: /^copiar/i }));

    expect(onConfirm).toHaveBeenCalledWith(['tue'], 'append');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('without allowAppend, hides the mode toggle and confirms with replace', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog({ onConfirm, allowAppend: undefined });

    expect(screen.queryByRole('button', { name: /añadir junto/i })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /Martes/ }));
    await user.click(screen.getByRole('button', { name: /^copiar/i }));

    expect(onConfirm).toHaveBeenCalledWith(['tue'], 'replace');
  });

  it('with allowAppend, shows the mode toggle', () => {
    renderDialog({ allowAppend: true });
    expect(screen.getByRole('button', { name: /añadir junto/i })).toBeInTheDocument();
  });

  // vaul draws no close affordance of its own, so the mobile branch would be
  // dismissible only by dragging it without an explicit control.
  it('offers a Cancel control on mobile that closes the dialog', async () => {
    setViewport(false);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('leaves the Cancel control to radix on desktop', () => {
    renderDialog();
    // The desktop DialogContent draws its own X — a second control would be noise.
    expect(screen.queryByRole('button', { name: /cancelar/i })).toBeNull();
  });
});
