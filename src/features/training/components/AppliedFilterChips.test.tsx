import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { render, screen, fireEvent } from '@testing-library/react';
import { AppliedFilterChips, type BrowseFilters, EMPTY_FILTERS } from './AppliedFilterChips';

beforeEach(async () => { await i18n.changeLanguage('es'); });

const filters: BrowseFilters = { category: 'strength', equipment: 'barbell', level: null, muscleValue: 'pec_lower' };

describe('AppliedFilterChips', () => {
  it('renders nothing when no filters are active', () => {
    const { container } = render(
      <AppliedFilterChips filters={EMPTY_FILTERS} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one chip per active filter and clears just that one on its X', () => {
    const onChange = vi.fn();
    render(<AppliedFilterChips filters={filters} onChange={onChange} />);
    expect(screen.getByText('Fuerza')).toBeInTheDocument();        // category
    expect(screen.getByText('Barra')).toBeInTheDocument();         // equipment
    fireEvent.click(screen.getByRole('button', { name: /Fuerza/ }));
    expect(onChange).toHaveBeenCalledWith({ ...filters, category: null });
  });

  it('clear-all resets to EMPTY_FILTERS', () => {
    const onChange = vi.fn();
    render(<AppliedFilterChips filters={filters} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
