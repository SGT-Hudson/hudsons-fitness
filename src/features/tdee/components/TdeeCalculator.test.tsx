// @vitest-environment jsdom
//
// R-37 Tier-2. The body is pure — the frames own the hooks and pass data in —
// so there is no supabase mock and no QueryClientProvider here. What this pins:
//  - the result recomputes live as the inputs are typed;
//  - the Katch line appears only when a body-fat reading came in;
//  - the adaptive-comparison strip appears only when a measured TDEE exists;
//  - apply hands back the ROUNDED formula TDEE (the value the phase editor
//    writes into kcal_value), and is absent without an onApply callback.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { TdeeCalculator, type TdeeCalculatorData } from './TdeeCalculator';

// 80 kg / 180 cm / 36 y male → Mifflin 1750; sedentary (1.2) → 2100 kcal.
function data(over: Partial<TdeeCalculatorData> = {}): TdeeCalculatorData {
  return {
    sex: 'male',
    ageYears: 36,
    heightCm: 180,
    weightKg: 80,
    bodyFat: null,
    adaptiveTdeeKcal: null,
    adaptiveConfidence: null,
    ...over,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('TdeeCalculator', () => {
  it('shows the Mifflin BMR and the sedentary TDEE from the seeded data', () => {
    render(<TdeeCalculator data={data()} />);
    expect(screen.getByTestId('tdee-bmr')).toHaveTextContent('1750');
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('2100');
  });

  it('recomputes when the activity level changes', async () => {
    const user = userEvent.setup();
    render(<TdeeCalculator data={data()} />);
    await user.click(screen.getByRole('radio', { name: /Muy activo/ }));
    // 1750 × 1.9 = 3325
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('3325');
  });

  it('recomputes when the weight is edited, and withholds the result when cleared', async () => {
    const user = userEvent.setup();
    render(<TdeeCalculator data={data()} />);
    const weight = screen.getByLabelText(/Peso/);
    await user.clear(weight);
    expect(screen.queryByTestId('tdee-result')).toBeNull();
    expect(screen.getByTestId('tdee-incomplete')).toBeInTheDocument();
    await user.type(weight, '90');
    // Mifflin male 90/180/36 = 900 + 1125 - 180 + 5 = 1850 ; ×1.2 = 2220
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('2220');
  });

  it('renders no Katch line without a body-fat reading, and one with it', () => {
    const { unmount } = render(<TdeeCalculator data={data()} />);
    expect(screen.queryByTestId('tdee-katch')).toBeNull();
    unmount();

    render(
      <TdeeCalculator
        data={data({ bodyFat: { pct: 20, measuredOn: '2026-05-18' } })}
      />,
    );
    // lean 64 kg → 370 + 21.6×64 = 1752.4 ; ×1.2 = 2102.88 → 2103
    expect(screen.getByTestId('tdee-katch')).toHaveTextContent('2103');
    expect(screen.getByTestId('tdee-katch')).toHaveTextContent('2026');
  });

  it('renders the forward-looking note when there is no adaptive estimate', () => {
    render(<TdeeCalculator data={data()} />);
    expect(screen.getByTestId('tdee-no-adaptive')).toBeInTheDocument();
    expect(screen.queryByTestId('tdee-adaptive')).toBeNull();
  });

  it('renders the comparison strip when an adaptive estimate exists', () => {
    render(
      <TdeeCalculator
        data={data({ adaptiveTdeeKcal: 2400, adaptiveConfidence: 'high' })}
      />,
    );
    const strip = screen.getByTestId('tdee-adaptive');
    expect(strip).toHaveTextContent('2400');
    // 2400 - 2100 = 300 above
    expect(strip).toHaveTextContent('300');
    expect(screen.queryByTestId('tdee-no-adaptive')).toBeNull();
  });

  it('surfaces a low-confidence caveat on the strip', () => {
    render(
      <TdeeCalculator
        data={data({ adaptiveTdeeKcal: 2400, adaptiveConfidence: 'low' })}
      />,
    );
    expect(screen.getByTestId('tdee-adaptive')).toHaveTextContent(
      i18n.t('objetivos:tdee.adaptiveLow'),
    );
  });

  it('renders no apply button without an onApply callback', () => {
    render(<TdeeCalculator data={data()} />);
    expect(screen.queryByTestId('tdee-apply')).toBeNull();
  });

  it('applies the rounded formula TDEE', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<TdeeCalculator data={data()} onApply={onApply} />);
    await user.click(screen.getByTestId('tdee-apply'));
    expect(onApply).toHaveBeenCalledWith(2100);
  });

  it('restores the seeded data after an edit', async () => {
    const user = userEvent.setup();
    render(<TdeeCalculator data={data()} />);
    const weight = screen.getByLabelText(/Peso/);
    await user.clear(weight);
    await user.type(weight, '90');
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('2220');
    await user.click(screen.getByTestId('tdee-reset'));
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('2100');
  });
});
