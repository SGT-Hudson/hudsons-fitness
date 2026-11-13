// @vitest-environment jsdom
//
// R-38 Tier-2. Props-in, so no supabase mock. What this pins:
//  - the three rows and their numbers;
//  - the balance is intake − expenditure, signed;
//  - an incomplete profile drops ONLY the BMR row, not the card.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { EnergyBalanceCard, type EnergyBalanceData } from './EnergyBalanceCard';

function data(over: Partial<EnergyBalanceData> = {}): EnergyBalanceData {
  return { tdeeKcal: 2520, avgIntakeKcal: 2010, bmrKcal: 1840, ...over };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('EnergyBalanceCard', () => {
  it('shows the three figures', () => {
    render(<EnergyBalanceCard data={data()} />);
    expect(screen.getByTestId('energy-tdee')).toHaveTextContent('2520');
    expect(screen.getByTestId('energy-intake')).toHaveTextContent('2010');
    expect(screen.getByTestId('energy-bmr')).toHaveTextContent('1840');
  });

  it('shows the deficit as a signed balance', () => {
    render(<EnergyBalanceCard data={data()} />);
    expect(screen.getByTestId('energy-balance')).toHaveTextContent('-510');
  });

  it('shows a surplus with a plus sign', () => {
    render(<EnergyBalanceCard data={data({ avgIntakeKcal: 2900 })} />);
    expect(screen.getByTestId('energy-balance')).toHaveTextContent('+380');
  });

  it('drops only the BMR row when the profile cannot produce one', () => {
    render(<EnergyBalanceCard data={data({ bmrKcal: null })} />);
    expect(screen.queryByTestId('energy-bmr')).not.toBeInTheDocument();
    expect(screen.getByTestId('energy-tdee')).toBeInTheDocument();
    expect(screen.getByTestId('energy-balance')).toBeInTheDocument();
  });
});
