import '@/i18n';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KcalHero } from './KcalHero';

describe('KcalHero', () => {
  it('shows remaining = target - consumed and a bar at consumed/target width', () => {
    render(<KcalHero consumed={1568} target={2180} phaseType="cut" />);
    expect(screen.getByTestId('kcal-hero-remaining')).toHaveTextContent('612');
    const bar = screen.getByTestId('kcal-hero-bar');
    const pct = (1568 / 2180) * 100;
    expect(bar).toHaveStyle({ width: `${pct}%` });
    // consumed / target row (en-US groups 4-digit values)
    expect(screen.getByText('1,568')).toBeInTheDocument();
    expect(screen.getByText('2,180')).toBeInTheDocument();
  });

  it('clamps remaining to 0 and the bar to 100% when over target', () => {
    render(<KcalHero consumed={2400} target={2000} phaseType="cut" />);
    expect(screen.getByTestId('kcal-hero-remaining')).toHaveTextContent('0');
    expect(screen.getByTestId('kcal-hero-bar')).toHaveStyle({ width: '100%' });
  });

  it('renders the phase chip and the TDEE micro-line', () => {
    render(
      <KcalHero
        consumed={1568}
        target={2180}
        phaseType="cut"
        phaseLabel="Corte"
        tdeeKcal={2480}
      />,
    );
    expect(screen.getByText('Corte')).toBeInTheDocument();
    expect(screen.getByText(/TDEE 2,480 kcal/)).toBeInTheDocument();
  });

  it('low TDEE confidence swaps the micro-line for the approximate-target note', () => {
    render(
      <KcalHero
        consumed={1568}
        target={2180}
        phaseType="cut"
        tdeeKcal={2480}
        tdeeConfidence="low"
      />,
    );
    expect(screen.getByText(/calentamiento|warming up/i)).toBeInTheDocument();
    expect(screen.queryByText(/TDEE 2,480 kcal/)).toBeNull();
  });
});
