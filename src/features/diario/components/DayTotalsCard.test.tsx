import '@/i18n';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayTotalsCard } from './DayTotalsCard';

const Z = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

describe('DayTotalsCard', () => {
  it('over-protein renders the met (green) class; protein bar is not destructive', () => {
    // fat=50 is above the essential floor (round(0.20*2000/9)=44g) to avoid fatLow
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1180, proteinG: 175, fatG: 50 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        proteinBasis="lean"
        phaseType="cut"
      />,
    );
    expect(screen.getByText(/cubierto|met/i)).toBeInTheDocument();
    // No destructive styling present — protein excess is dark-green (good), not red
    const bars = document.querySelectorAll('[data-seg]');
    const destructiveBars = Array.from(bars).filter((el) =>
      el.classList.contains('bg-destructive'),
    );
    expect(destructiveBars).toHaveLength(0);
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

  it('low-fiber day shows no amber warning — fiber is informational', () => {
    const { container } = render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1800, fiberG: 5 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        phaseType="cut"
      />,
    );
    // Must NOT render any amber or destructive text for fiber
    expect(container.querySelector('.text-amber-600')).toBeNull();
    // Must NOT show the old "bajo el mínimo" / "below minimum" warning text
    expect(screen.queryByText(/bajo el mínimo|below minimum/i)).toBeNull();
  });

  it('low-fat day shows the "Falta grasa" / "Low fat" aviso', () => {
    // 2000 kcal → essential fat floor = round(0.20 * 2000 / 9) = 44 g
    // Give only 10 g fat → below floor → fatLow
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1800, fatG: 10 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        phaseType="cut"
      />,
    );
    expect(screen.getByText(/falta grasa|low fat/i)).toBeInTheDocument();
  });
});
