import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyMealPanel } from './CopyMealPanel';

const targets = [
  { key: '2026-05-26', label: 'Martes', sublabel: '26 may', willOverwrite: true },
  { key: '2026-05-27', label: 'Miércoles', sublabel: '27 may', willOverwrite: false },
];

const noop = () => {};

beforeAll(() => {
  void i18n.changeLanguage('es');
});

function setup(over: Partial<Parameters<typeof CopyMealPanel>[0]> = {}) {
  const props = {
    sourceLabel: '14:00 · Lunes',
    entryNames: ['Lentejas estofadas', 'Pan integral'],
    targets,
    mode: 'replace' as const,
    onModeChange: noop,
    selected: new Set<string>(),
    onToggle: noop,
    onConfirm: noop,
    ...over,
  };
  return { props, ...render(<CopyMealPanel {...props} />) };
}

describe('CopyMealPanel', () => {
  it('recaps the source meal and its recipes', () => {
    setup();
    expect(screen.getByText('14:00 · Lunes')).toBeInTheDocument();
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
  });

  it('warns about overwriting only in replace mode', () => {
    const { unmount } = setup({ mode: 'replace' });
    expect(screen.getByText(/se sobrescribirá/i)).toBeInTheDocument();
    unmount();

    setup({ mode: 'append' });
    // Append never overwrites — the badge must be gone.
    expect(screen.queryByText(/se sobrescribirá/i)).toBeNull();
  });

  it('switches mode through the segmented control', async () => {
    const onModeChange = vi.fn();
    setup({ onModeChange });
    await userEvent.click(screen.getByRole('button', { name: /añadir junto/i }));
    expect(onModeChange).toHaveBeenCalledWith('append');
  });

  it('toggles a day', async () => {
    const onToggle = vi.fn();
    setup({ onToggle });
    await userEvent.click(screen.getByRole('checkbox', { name: /Martes/ }));
    expect(onToggle).toHaveBeenCalledWith('2026-05-26');
  });

  it('disables the CTA until at least one day is picked, and confirms with the mode', async () => {
    const onConfirm = vi.fn();
    const { unmount } = setup({ onConfirm });
    expect(screen.getByRole('button', { name: /^copiar/i })).toBeDisabled();
    unmount();

    setup({ onConfirm, selected: new Set(['2026-05-27']), mode: 'append' });
    await userEvent.click(screen.getByRole('button', { name: /^copiar/i }));
    expect(onConfirm).toHaveBeenCalledWith(['2026-05-27'], 'append');
  });
});
