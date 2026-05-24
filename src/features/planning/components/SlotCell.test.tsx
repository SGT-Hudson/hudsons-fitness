import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlotCell, type SlotEntry } from './SlotCell';

const entry: SlotEntry = { id: '1', recipe_id: 'r', recipe_name: 'Avena', servings: 1 };
const noop = () => {};

describe('SlotCell copy affordance', () => {
  it('renders the copy button when onCopy is set and there is ≥1 entry', () => {
    render(
      <SlotCell
        entries={[entry]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
        onCopy={vi.fn()}
        copyLabel="Copiar comida"
      />,
    );
    expect(screen.getByRole('button', { name: 'Copiar comida' })).toBeInTheDocument();
  });

  it('hides the copy button when the meal is empty', () => {
    render(
      <SlotCell
        entries={[]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
        onCopy={vi.fn()}
        copyLabel="Copiar comida"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Copiar comida' })).toBeNull();
  });
});
