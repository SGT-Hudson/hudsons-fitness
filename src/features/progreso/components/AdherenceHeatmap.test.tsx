// @vitest-environment jsdom
//
// R-38 Tier-2. The component is props-in — the page owns the hooks — so there
// is no supabase mock and no QueryClientProvider here. What this pins:
//  - one button per drawn day, and none for the sinDatos padding;
//  - the five legend entries are always named, so colour never stands alone;
//  - tapping a cell writes the detail line (the touch-friendly replacement for
//    a hover tooltip);
//  - the aria-label carries the numbers, not just the colour.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { AdherenceHeatmap } from './AdherenceHeatmap';
import type { AdherenceDay } from '../adherence';

function day(over: Partial<AdherenceDay> & { date: string }): AdherenceDay {
  return {
    targetKcal: 2000,
    consumedKcal: 2000,
    deviationPct: 0,
    state: 'enObjetivo',
    ...over,
  };
}

const DAYS: AdherenceDay[] = [
  day({ date: '2026-03-02' }),
  day({ date: '2026-03-03', consumedKcal: 2300, deviationPct: 15, state: 'cerca' }),
  day({ date: '2026-03-04', consumedKcal: null, deviationPct: null, state: 'sinRegistrar' }),
  day({ date: '2026-03-05', targetKcal: null, consumedKcal: null, deviationPct: null, state: 'sinObjetivo' }),
];

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('AdherenceHeatmap', () => {
  it('draws one button per day and skips the padding', () => {
    render(<AdherenceHeatmap days={DAYS} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('does not draw a button for a sinDatos day', () => {
    render(
      <AdherenceHeatmap
        days={[...DAYS, day({ date: '2026-03-06', state: 'sinDatos', targetKcal: null, consumedKcal: null, deviationPct: null })]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('names all five states in the legend', () => {
    render(<AdherenceHeatmap days={DAYS} />);
    for (const label of ['En objetivo', 'Cerca', 'Lejos', 'Sin registrar', 'Sin objetivo']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('puts the numbers in the cell aria-label, not just the colour', () => {
    render(<AdherenceHeatmap days={DAYS} />);
    expect(
      screen.getByRole('button', { name: /2300 de 2000 kcal, Cerca/ }),
    ).toBeInTheDocument();
  });

  it('writes the detail line when a cell is tapped', async () => {
    const user = userEvent.setup();
    render(<AdherenceHeatmap days={DAYS} />);
    await user.click(screen.getByRole('button', { name: /2300 de 2000 kcal/ }));
    expect(screen.getByTestId('adherence-detail')).toHaveTextContent('2300 / 2000 kcal');
    expect(screen.getByTestId('adherence-detail')).toHaveTextContent('+15');
  });

  it('shows the hint until something is selected', () => {
    render(<AdherenceHeatmap days={DAYS} />);
    expect(screen.getByTestId('adherence-detail')).toHaveTextContent('Toca un día');
  });

  it('shows the empty copy when every day is sinDatos', () => {
    render(<AdherenceHeatmap days={[day({ date: '2026-03-02', state: 'sinDatos' })]} />);
    expect(screen.getByText('Aún no hay días registrados.')).toBeInTheDocument();
  });
});
