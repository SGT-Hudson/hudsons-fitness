import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';
import { MuscleSelect } from './MuscleSelect';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('MuscleSelect', () => {
  it('renders the All option + fine codes and forwards the picked value', () => {
    const onChange = vi.fn();
    render(<MuscleSelect value="" onChange={onChange} ariaLabel="Todos los músculos" />);
    const select = screen.getByRole('combobox', { name: 'Todos los músculos' });
    // concrete, unique assertions (no catch-all regex):
    const all = screen.getByRole('option', { name: 'Todos los músculos' }) as HTMLOptionElement;
    expect(all.value).toBe('');
    expect(screen.getByRole('option', { name: 'Pectoral inferior' })).toBeInTheDocument(); // pec_lower
    fireEvent.change(select, { target: { value: 'group:arms' } });
    expect(onChange).toHaveBeenCalledWith('group:arms');
  });
});
