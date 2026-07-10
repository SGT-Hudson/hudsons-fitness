import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddResultRow } from './AddResultRow';

describe('AddResultRow', () => {
  it('renders the name, kcal and subtitle, and fires onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(
      <AddResultRow
        kind="recipe"
        name="Tortilla francesa"
        kcal={250}
        subtitle="2 raciones"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('Tortilla francesa')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('2 raciones')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tortilla francesa'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('omits the kcal figure when null', () => {
    render(<AddResultRow kind="ingredient" name="Manzana" kcal={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Manzana')).toBeInTheDocument();
    expect(screen.queryByText('kcal')).not.toBeInTheDocument();
  });
});
