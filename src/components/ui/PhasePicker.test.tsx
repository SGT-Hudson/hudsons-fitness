import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhasePicker } from './PhasePicker';

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('PhasePicker', () => {
  it('offers the three phases and an explicit no-phase option', () => {
    render(<PhasePicker value={null} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /corte/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /volumen/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /mantenimiento/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /sin fase/i })).toBeInTheDocument();
  });

  it('marks the current value as checked', () => {
    render(<PhasePicker value="cut" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /corte/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /sin fase/i })).not.toBeChecked();
  });

  it('emits the picked phase', async () => {
    const onChange = vi.fn();
    render(<PhasePicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /volumen/i }));
    expect(onChange).toHaveBeenCalledWith('bulk');
  });

  it('emits null when the no-phase option is picked', async () => {
    const onChange = vi.fn();
    render(<PhasePicker value="cut" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /sin fase/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
