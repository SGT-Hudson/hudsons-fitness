import '@/i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '@/i18n';
import { MealSlotSelector } from './MealSlotSelector';

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('MealSlotSelector', () => {
  it('renders the 4 real meal slots (not "other"), the active one checked, with kcal subtotals', () => {
    render(
      <MealSlotSelector
        value="lunch"
        onChange={vi.fn()}
        subtotals={{ breakfast: 320, lunch: 610 }}
      />,
    );
    expect(screen.getByRole('radio', { name: /Comida/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Desayuno/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('radio', { name: /Otro/ })).not.toBeInTheDocument();
    expect(screen.getByText('320')).toBeInTheDocument();
    expect(screen.getByText('610')).toBeInTheDocument();
  });

  it('shows an empty-state label for a slot with no subtotal', () => {
    render(<MealSlotSelector value="breakfast" onChange={vi.fn()} subtotals={{}} />);
    expect(screen.getAllByText('vacío')).toHaveLength(4);
  });

  it('fires onChange with the clicked slot', () => {
    const onChange = vi.fn();
    render(<MealSlotSelector value="breakfast" onChange={onChange} subtotals={{}} />);
    fireEvent.click(screen.getByRole('radio', { name: /Cena/ }));
    expect(onChange).toHaveBeenCalledWith('dinner');
  });
});
