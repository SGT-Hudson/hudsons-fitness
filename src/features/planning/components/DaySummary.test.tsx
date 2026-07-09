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
    // weightKg 80 → floor round(0.6 * 80) = 48 g. 30 g consumed is below it.
    const totals: Macros = { kcal: 1850, proteinG: 120, carbsG: 180, fatG: 30, fiberG: 12 };
    render(<DaySummary totals={totals} targets={target} phaseType="cut" weightKg={80} />);
    expect(screen.getByText(/falta grasa/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /grasa.*ayuda|ayuda|info/i })).toBeInTheDocument();
  });

  it('shows NO aviso when fat is adequate', () => {
    const totals: Macros = { kcal: 1990, proteinG: 152, carbsG: 195, fatG: 63, fiberG: 31 };
    render(<DaySummary totals={totals} targets={target} phaseType="cut" weightKg={80} />);
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

  // --- R-33 tone core: pinned user-visible behaviour changes (spec §1) ---

  it('protein 20% under target renders text-destructive (was silent grey before the tone core)', () => {
    const totals: Macros = { kcal: 1800, proteinG: 160, carbsG: 180, fatG: 60, fiberG: 28 };
    const targets: Macros = { kcal: 2180, proteinG: 200, carbsG: 245, fatG: 68, fiberG: 30 };
    render(<DaySummary totals={totals} targets={targets} phaseType="cut" />);
    const proteinLabel = screen.getByText('Prot');
    const row = proteinLabel.closest('div.flex');
    expect(row?.querySelector('.text-destructive')).not.toBeNull();
  });

  it('carbs in a bulk phase render text-tone-good (were grey before the tone core)', () => {
    const totals: Macros = { kcal: 2850, proteinG: 172, carbsG: 272, fatG: 60, fiberG: 29 };
    const targets: Macros = { kcal: 2780, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 };
    render(<DaySummary totals={totals} targets={targets} phaseType="bulk" />);
    const carbsLabel = screen.getByText('Carbs');
    const row = carbsLabel.closest('div.flex');
    expect(row?.querySelector('.text-tone-good')).not.toBeNull();
    expect(row?.querySelector('.text-destructive')).toBeNull();
  });

  it('kcal in maintenance at +5.6% over target renders text-tone-warn (was text-destructive before)', () => {
    const totals: Macros = { kcal: 2620, proteinG: 172, carbsG: 238, fatG: 60, fiberG: 29 };
    const targets: Macros = { kcal: 2480, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 };
    const { container } = render(<DaySummary totals={totals} targets={targets} phaseType="maintenance" />);
    const kcalLine = container.querySelector('.text-sm.font-bold');
    expect(kcalLine).toHaveClass('text-tone-warn');
    expect(kcalLine).not.toHaveClass('text-destructive');
  });

  it('fiber well under 90% of target renders text-tone-warn (was silently informational before the tone core)', () => {
    // 22/30 = 73.3%, well under the tone core's 90% fiber threshold → slightOver (amber).
    // Same value as the canvas's MiniWeek day3 fiber (nutritionTone.test.ts integration fixture).
    const totals: Macros = { kcal: 1800, proteinG: 160, carbsG: 180, fatG: 60, fiberG: 22 };
    const targets: Macros = { kcal: 2180, proteinG: 200, carbsG: 245, fatG: 68, fiberG: 30 };
    render(<DaySummary totals={totals} targets={targets} phaseType="cut" />);
    const fiberLabel = screen.getByText('Fibra');
    const row = fiberLabel.closest('div.flex');
    expect(row?.querySelector('.text-tone-warn')).not.toBeNull();
    expect(row?.querySelector('.text-destructive')).toBeNull();
  });
});
