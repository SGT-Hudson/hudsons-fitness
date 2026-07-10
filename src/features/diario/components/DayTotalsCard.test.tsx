import '@/i18n';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayTotalsCard } from './DayTotalsCard';

const Z = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

describe('DayTotalsCard', () => {
  it('over-protein renders the met (green) class; protein bar is not destructive', () => {
    // No weightKg passed → fat floor is unknown, so fat (well under its
    // target) stays 'good' and can't accidentally paint destructive here.
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

  it('cut kcal under target shows the ring (consumed) and the remaining footnote, not red', () => {
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1180 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        proteinBasis="lean"
        phaseType="cut"
      />,
    );
    // Ring center shows consumed; the footnote below it shows the remaining amount.
    expect(screen.getByText('1180')).toBeInTheDocument();
    expect(screen.getByText(/820/)).toBeInTheDocument();
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

  it('fiber within 90% of target shows no amber warning — still informational near the floor', () => {
    // 28/30 = 93.3%, at or above the tone core's 90% fiber threshold → good.
    const { container } = render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1800, fiberG: 28 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        phaseType="cut"
      />,
    );
    expect(container.querySelector('.text-tone-warn')).toBeNull();
    // Must NOT show the old "bajo el mínimo" / "below minimum" warning text
    expect(screen.queryByText(/bajo el mínimo|below minimum/i)).toBeNull();
  });

  it('low-fat day shows the "Falta grasa" / "Low fat" aviso when weight puts fat below the essential floor', () => {
    // weightKg 80 → floor round(0.6 * 80) = 48 g. Give only 10 g fat → below floor → over.
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1800, fatG: 10 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        phaseType="cut"
        weightKg={80}
      />,
    );
    expect(screen.getByText(/falta grasa|low fat/i)).toBeInTheDocument();
  });

  // --- R-33 tone core: pinned user-visible behaviour changes (spec §1) ---

  it('protein 20% under target renders text-destructive (was silent grey before the tone core)', () => {
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1800, proteinG: 160, carbsG: 180, fatG: 60, fiberG: 28 }}
        targets={{ kcal: 2180, proteinG: 200, carbsG: 245, fatG: 68, fiberG: 30 }}
        phaseType="cut"
      />,
    );
    const proteinLabel = screen.getByText(/^protein$|^proteína$/i);
    const proteinBlock = proteinLabel.closest('div.space-y-1');
    expect(proteinBlock?.querySelector('.text-destructive')).not.toBeNull();
  });

  it('carbs in a bulk phase render text-tone-good (were grey before the tone core)', () => {
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 2850, proteinG: 172, carbsG: 272, fatG: 60, fiberG: 29 }}
        targets={{ kcal: 2780, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 }}
        phaseType="bulk"
      />,
    );
    const carbsLabel = screen.getByText(/^carbs$|^carbohidratos$/i);
    const carbsBlock = carbsLabel.closest('div.space-y-1');
    expect(carbsBlock?.querySelector('.text-tone-good')).not.toBeNull();
    expect(carbsBlock?.querySelector('.text-destructive')).toBeNull();
  });

  it('kcal in maintenance at +5.6% over target renders text-tone-warn (was text-destructive before)', () => {
    const { container } = render(
      <DayTotalsCard
        totals={{ kcal: 2620, proteinG: 172, carbsG: 238, fatG: 60, fiberG: 29 }}
        targets={{ kcal: 2480, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 }}
        phaseType="maintenance"
      />,
    );
    const ringValue = container.querySelector('[data-testid="kcal-ring-value"]');
    expect(ringValue).toHaveClass('text-tone-warn');
    expect(ringValue).not.toHaveClass('text-destructive');
  });

  it('plan-of-today footnote shows only when planKcal is positive', () => {
    const props = {
      totals: { ...Z, kcal: 1180 },
      targets: { kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 },
      phaseType: 'cut' as const,
    };
    const { rerender } = render(<DayTotalsCard {...props} planKcal={640} />);
    expect(screen.getByText(/plan de hoy|today's plan/i)).toBeInTheDocument();

    rerender(<DayTotalsCard {...props} planKcal={0} />);
    expect(screen.queryByText(/plan de hoy|today's plan/i)).toBeNull();
  });

  it('fiber well under 90% of target renders text-tone-warn (was silently informational before the tone core)', () => {
    // 22/30 = 73.3%, well under the tone core's 90% fiber threshold → slightOver (amber).
    // Same value as the canvas's MiniWeek day3 fiber (nutritionTone.test.ts integration fixture).
    render(
      <DayTotalsCard
        totals={{ ...Z, kcal: 1800, fiberG: 22 }}
        targets={{ kcal: 2000, proteinG: 165, carbsG: 180, fatG: 60, fiberG: 30 }}
        phaseType="cut"
      />,
    );
    const fiberLabel = screen.getByText(/^fiber$|^fibra$/i);
    const fiberBlock = fiberLabel.closest('div.space-y-1');
    expect(fiberBlock?.querySelector('.text-tone-warn')).not.toBeNull();
    expect(fiberBlock?.querySelector('.text-destructive')).toBeNull();
  });
});
