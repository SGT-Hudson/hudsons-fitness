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
    onToggleAll: noop,
    onConfirm: noop,
    allowAppend: true,
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

  it('offers a tri-state select-all: unchecked with none picked', () => {
    setup({ selected: new Set() });
    expect(screen.getByRole('checkbox', { name: /todos/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('offers a tri-state select-all: mixed with some picked', () => {
    setup({ selected: new Set(['2026-05-26']) });
    expect(screen.getByRole('checkbox', { name: /todos/i })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
  });

  it('offers a tri-state select-all: checked with every day picked', () => {
    setup({ selected: new Set(['2026-05-26', '2026-05-27']) });
    expect(screen.getByRole('checkbox', { name: /todos/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('bubbles the select-all click to the caller', async () => {
    const onToggleAll = vi.fn();
    setup({ onToggleAll });
    await userEvent.click(screen.getByRole('checkbox', { name: /todos/i }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
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

  it('without allowAppend, hides the mode toggle and always confirms replace even if the mode prop says append', async () => {
    const onConfirm = vi.fn();
    setup({
      allowAppend: undefined,
      mode: 'append',
      onConfirm,
      selected: new Set(['2026-05-26']),
    });
    expect(screen.queryByRole('button', { name: /añadir junto/i })).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^copiar/i }));
    expect(onConfirm).toHaveBeenCalledWith(['2026-05-26'], 'replace');
  });

  it('with allowAppend, shows the mode toggle and lets it switch to append', async () => {
    const onModeChange = vi.fn();
    setup({ allowAppend: true, onModeChange });
    expect(screen.getByRole('button', { name: /añadir junto/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /añadir junto/i }));
    expect(onModeChange).toHaveBeenCalledWith('append');
  });

  // R-33 wave 3 QA fix: "Copiar a 1 días" read as a plural for a single
  // selected day. summaryReplace/summaryAppend now carry i18next _one/_other
  // forms, keyed off `selected.size` passed as `count`.
  it('uses the singular summary form for exactly one selected day, in both replace and append mode', () => {
    const { unmount } = setup({ mode: 'replace', selected: new Set(['2026-05-26']) });
    expect(screen.getByText('Copiar a 1 día, reemplazando lo que haya.')).toBeInTheDocument();
    unmount();

    setup({ mode: 'append', selected: new Set(['2026-05-26']) });
    expect(screen.getByText('Copiar a 1 día, junto a lo que ya haya.')).toBeInTheDocument();
  });

  it('uses the plural summary form for two or more selected days, in both replace and append mode', () => {
    const twoDays = new Set(['2026-05-26', '2026-05-27']);
    const { unmount } = setup({ mode: 'replace', selected: twoDays });
    expect(screen.getByText('Copiar a 2 días, reemplazando lo que haya.')).toBeInTheDocument();
    unmount();

    setup({ mode: 'append', selected: twoDays });
    expect(screen.getByText('Copiar a 2 días, junto a lo que ya haya.')).toBeInTheDocument();
  });
});
