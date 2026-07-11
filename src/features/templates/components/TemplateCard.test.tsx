import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TemplateCard } from './TemplateCard';

const base = {
  id: 't1',
  name: 'Semana base',
  phase_type: 'cut' as 'cut' | 'bulk' | 'maintenance' | null,
  default_meal_times: ['08:00', '14:00'],
  slot_count: 8,
  updated_at: '2026-05-20T10:00:00Z',
};

const filled = Array.from({ length: 7 }, () => [true, false]);

function renderCard(over: Partial<typeof base> = {}, onDelete = vi.fn()) {
  return {
    onDelete,
    ...render(
      <MemoryRouter>
        <TemplateCard template={{ ...base, ...over }} filled={filled} onDelete={onDelete} />
      </MemoryRouter>,
    ),
  };
}

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

describe('TemplateCard', () => {
  it('shows the name, the phase chip and the dot grid', () => {
    const { container } = renderCard();
    expect(screen.getByText('Semana base')).toBeInTheDocument();
    expect(screen.getByText('Corte')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-dot]').length).toBe(14);
  });

  it('tints the strip and the filled dots with the phase', () => {
    const { container } = renderCard();
    expect(container.querySelector('[data-phase-strip]')?.className).toContain('bg-phase-cut');
    expect(container.querySelector('[data-dot="on"]')?.className).toContain('bg-phase-cut');
  });

  it('renders an untagged template neutrally — no phase chip, no phase tint', () => {
    const { container } = renderCard({ phase_type: null });
    expect(screen.queryByText('Corte')).toBeNull();
    expect(screen.queryByText(/sin fase/i)).toBeNull();
    expect(container.querySelector('[data-phase-strip]')?.className).not.toContain('bg-phase-');
    expect(container.querySelector('[data-dot="on"]')?.className).not.toContain('bg-phase-');
  });

  it('links to the editor', () => {
    renderCard();
    expect(screen.getByRole('link', { name: /semana base/i })).toHaveAttribute(
      'href',
      '/templates/t1',
    );
  });

  it('shows the slot count and the meals per day', () => {
    renderCard();
    expect(screen.getByText(/8 huecos/)).toBeInTheDocument();
    expect(screen.getByText(/2 comidas\/día/)).toBeInTheDocument();
  });

  it('calls onDelete from the delete affordance', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('no longer shows an Auto badge', () => {
    renderCard();
    expect(screen.queryByText(/auto/i)).toBeNull();
  });
});
