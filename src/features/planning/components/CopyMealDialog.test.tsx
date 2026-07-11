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

// jsdom has no matchMedia; ResponsiveDialog needs one. Desktop branch.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: true,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

function renderDialog(over: Partial<Parameters<typeof CopyMealDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    sourceLabel: 'Desayuno (08:00) · lunes',
    entryNames: ['Tortilla francesa'],
    targets,
    onConfirm: vi.fn(),
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
});
