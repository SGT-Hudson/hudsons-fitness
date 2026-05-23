import '@/i18n';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayTotalsCard } from './DayTotalsCard';

const Z = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

describe('DayTotalsCard', () => {
  it('over-protein renders the met (green) class, never destructive', () => {
    const { container } = render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1180, proteinG: 175 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        proteinBasis="lean"
        phaseType="cut"
      />,
    );
    expect(screen.getByText(/cubierto|met/i)).toBeInTheDocument();
    expect(container.querySelector('.bg-destructive')).toBeNull();
  });

  it('cut kcal under target shows the remaining hero, not red', () => {
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1180 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        proteinBasis="lean"
        phaseType="cut"
      />,
    );
    expect(screen.getByText('820')).toBeInTheDocument();
  });

  it('no targets → hint, no hero', () => {
    render(<DayTotalsCard totals={{ ...Z, kcal: 500 }} />);
    expect(screen.getByText(/active phase|fase activa/i)).toBeInTheDocument();
  });

  it('complete sub-macros render plain grams (no ≥, no qualifier)', () => {
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 500 }}
        subTotals={{ sugarG: { known: 12, missing: 0 }, satFatG: { known: 4, missing: 0 } }}
      />,
    );
    expect(screen.getByText('12 g')).toBeInTheDocument();
    expect(screen.getByText('4 g')).toBeInTheDocument();
  });

  it('partial sugar data renders the ≥ prefix and missing-count qualifier', () => {
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 500 }}
        subTotals={{ sugarG: { known: 12, missing: 2 }, satFatG: { known: 4, missing: 0 } }}
      />,
    );
    // honest-partial: "≥ 12 g · 2 missing/sin datos"
    expect(screen.getByText(/≥/)).toBeInTheDocument();
    expect(screen.getByText(/2 (missing|sin datos)/i)).toBeInTheDocument();
  });
});
