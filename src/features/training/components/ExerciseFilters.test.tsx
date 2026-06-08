import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { render, screen, fireEvent } from '@testing-library/react';
import { ExerciseFilters } from './ExerciseFilters';
import { EMPTY_FILTERS } from './AppliedFilterChips';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('ExerciseFilters', () => {
  it('shows the active-filter count on the closed trigger button', () => {
    // count badge lives on the always-rendered trigger — no portal needed
    render(<ExerciseFilters filters={{ ...EMPTY_FILTERS, category: 'strength' }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Filtros/ })).toHaveTextContent('1');
  });

  it('opens on click and emits an updated filters object on category change', () => {
    const onChange = vi.fn();
    render(<ExerciseFilters filters={EMPTY_FILTERS} onChange={onChange} />);
    // Component controls `open` via its own React state (no DrawerTrigger), so a
    // click flips state and the controlled Drawer renders content synchronously —
    // the pattern drawer.test.tsx proves with <Drawer open> and ExerciseInfoButton uses.
    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(screen.getByText('Filtrar ejercicios')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'strength' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, category: 'strength' });
  });
});
