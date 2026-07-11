import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekSummaryCard } from './WeekSummaryCard';

const days = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-05-${25 + i}`,
  kcal: 2240,
  isToday: i === 1,
}));

const targets = { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 };

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('WeekSummaryCard', () => {
  it('shows the daily average and the signed per-day delta', () => {
    render(<WeekSummaryCard days={days} targets={targets} phase="cut" />);
    expect(screen.getByText('2240')).toBeInTheDocument();
    expect(screen.getByText(/\+60 kcal/)).toBeInTheDocument();
  });

  it('embeds the weekly chart without its own header', () => {
    const { container } = render(<WeekSummaryCard days={days} targets={targets} phase="cut" />);
    expect(container.querySelectorAll('[data-testid="weekly-kcal-bar"]').length).toBe(7);
    expect(screen.queryByText('Semana')).toBeNull(); // chart header suppressed
  });

  it('renders without targets', () => {
    render(<WeekSummaryCard days={days} />);
    expect(screen.getByText('2240')).toBeInTheDocument();
  });
});
