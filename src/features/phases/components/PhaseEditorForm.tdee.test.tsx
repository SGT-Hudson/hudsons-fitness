// @vitest-environment jsdom
//
// R-37 — the phase editor's TDEE sheet. What it pins is the one thing the
// feature can get silently wrong: APPLY WRITES BOTH FIELDS. In `tdee_delta`
// mode `kcal_value` is a delta, so writing a TDEE into it without also
// flipping `kcal_mode` to `absolute` would turn "2100 kcal" into "TDEE + 2100"
// — a number nobody asked for, in a form that looks correct.
//
// `PhaseEditorForm` calls no data hook (the page reads them and passes a plain
// object down), so this needs no supabase mock and no QueryClientProvider.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { PhaseEditorForm } from './PhaseEditorForm';
import type { Phase } from '../api';
import type { TdeeCalculatorData } from '@/features/tdee/components/TdeeCalculator';

/** A stored phase in delta mode — the state the calculator exists to rescue. */
const deltaPhase = {
  id: 'p1',
  user_id: 'u1',
  name: 'Corte',
  phase_type: 'cut',
  start_date: '2026-01-01',
  end_date: null,
  kcal_mode: 'tdee_delta',
  kcal_value: -300,
  protein_g_per_kg: 2.4,
  fat_pct_of_kcal: 0.25,
  fiber_mode: 'fixed_g',
  fiber_value: 30,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
} as Phase;

/** Mifflin, male 80 kg / 180 cm / 36 y = 1750 BMR; sedentary ×1.2 = 2100. */
const calculatorData: TdeeCalculatorData = {
  sex: 'male',
  ageYears: 36,
  heightCm: 180,
  weightKg: 80,
  bodyFat: null,
  adaptiveTdeeKcal: null,
  adaptiveConfidence: null,
};

const kcalField = () =>
  screen.getByLabelText(i18n.t('objetivos:phases.form.kcal')) as HTMLInputElement;

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('PhaseEditorForm — the TDEE sheet (R-37)', () => {
  it('applying writes the kcal value AND flips the mode to absolute', async () => {
    const user = userEvent.setup();
    render(
      <PhaseEditorForm
        phase={deltaPhase}
        onSubmit={vi.fn()}
        tdeeCalculator={calculatorData}
      />,
    );

    expect(kcalField().value).toBe('-300');
    // The delta suffix is on screen because the phase is in delta mode.
    expect(
      screen.getByText(i18n.t('objetivos:phases.form.kcalValueDelta')),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('phase-open-tdee'));
    expect(await screen.findByTestId('tdee-result')).toHaveTextContent('2100');

    await user.click(screen.getByTestId('tdee-apply'));

    // The sheet closes…
    await waitFor(() =>
      expect(screen.queryByTestId('tdee-apply')).not.toBeInTheDocument(),
    );
    // …the number lands in the field…
    expect(kcalField().value).toBe('2100');
    // …and the mode is now "fixed kcal", so 2100 means 2100.
    expect(
      screen.getByText(i18n.t('objetivos:phases.form.kcalValueFixed')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t('objetivos:phases.form.kcalValueDelta')),
    ).not.toBeInTheDocument();
  });

  it('offers no trigger without calculator data, nor in notes-only mode', () => {
    const { unmount } = render(
      <PhaseEditorForm phase={deltaPhase} onSubmit={vi.fn()} />,
    );
    expect(screen.queryByTestId('phase-open-tdee')).toBeNull();
    unmount();

    render(
      <PhaseEditorForm
        phase={deltaPhase}
        notesOnly
        onSubmit={vi.fn()}
        tdeeCalculator={calculatorData}
      />,
    );
    expect(screen.queryByTestId('phase-open-tdee')).toBeNull();
  });
});
