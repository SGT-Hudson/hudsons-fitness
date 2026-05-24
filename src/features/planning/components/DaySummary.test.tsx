import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';
import { DaySummary } from './DaySummary';
import type { Macros } from '@/core/macros';

beforeAll(() => {
  void i18n.changeLanguage('es');
});

const target: Macros = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 };

describe('DaySummary', () => {
  it('shows the Falta grasa aviso + help only when fat is below the essential floor', () => {
    const totals: Macros = { kcal: 1850, proteinG: 120, carbsG: 180, fatG: 30, fiberG: 12 };
    render(<DaySummary totals={totals} targets={target} phaseType="cut" />);
    expect(screen.getByText(/falta grasa/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /grasa.*ayuda|ayuda|info/i })).toBeInTheDocument();
  });

  it('shows NO aviso when fat is adequate', () => {
    const totals: Macros = { kcal: 1990, proteinG: 152, carbsG: 195, fatG: 63, fiberG: 31 };
    render(<DaySummary totals={totals} targets={target} phaseType="cut" />);
    expect(screen.queryByText(/falta grasa/i)).not.toBeInTheDocument();
  });

  it('renders kcal as "value / target Kcal" with the unit after the number', () => {
    const totals: Macros = { kcal: 1850, proteinG: 0, carbsG: 0, fatG: 50, fiberG: 0 };
    render(<DaySummary totals={totals} targets={target} phaseType="cut" />);
    expect(screen.getByText(/1\s?850/)).toBeInTheDocument();
    expect(screen.getByText(/Kcal/i)).toBeInTheDocument();
  });

  it('renders without targets (plain totals, no aviso)', () => {
    const totals: Macros = { kcal: 1200, proteinG: 60, carbsG: 100, fatG: 30, fiberG: 10 };
    render(<DaySummary totals={totals} phaseType={undefined} />);
    expect(screen.queryByText(/falta grasa/i)).not.toBeInTheDocument();
  });
});
