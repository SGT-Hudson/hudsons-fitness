import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyMealDialog, type CopyTarget } from './CopyMealDialog';

const targets: CopyTarget[] = [
  { key: 'tue', label: 'Martes', sublabel: '27 may', willOverwrite: true },
  { key: 'wed', label: 'Miércoles', sublabel: '28 may', willOverwrite: false },
  { key: 'thu', label: 'Jueves', sublabel: '29 may', willOverwrite: false },
];

function setup(onConfirm = vi.fn()) {
  render(
    <CopyMealDialog
      open
      onOpenChange={() => {}}
      sourceLabel="Desayuno (08:00) · lunes"
      entryCount={2}
      targets={targets}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('CopyMealDialog', () => {
  it('starts with nothing selected and confirm disabled', () => {
    setup();
    const confirm = screen.getByRole('button', { name: /copiar|copy/i });
    expect(confirm).toBeDisabled();
    targets.forEach((t) => {
      expect(screen.getByRole('checkbox', { name: new RegExp(t.label) })).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('shows the overwrite badge only on occupied targets', () => {
    setup();
    expect(screen.getAllByText(/sobrescrib|overwritten/i)).toHaveLength(1);
  });

  it('select-all checks every day and confirm returns all keys', async () => {
    const user = userEvent.setup();
    const onConfirm = setup();
    await user.click(screen.getByRole('checkbox', { name: /seleccionar todos|select all/i }));
    await user.click(screen.getByRole('button', { name: /copiar|copy/i }));
    expect(onConfirm).toHaveBeenCalledWith(['tue', 'wed', 'thu']);
  });

  it('toggling one day enables confirm and returns just that key', async () => {
    const user = userEvent.setup();
    const onConfirm = setup();
    await user.click(screen.getByRole('checkbox', { name: /Miércoles/ }));
    const confirm = screen.getByRole('button', { name: /copiar|copy/i });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(['wed']);
  });
});
