// @vitest-environment jsdom
//
// R-33 wave 8, B2 — the live preview. What it pins:
//  - the numbers come from the REAL macro maths (computeDraftTargets →
//    computeDailyMacroTargets), never the canvas's fixture arithmetic;
//  - `draft.fat_pct_of_kcal` is consumed as the DB FRACTION (0.275 → 61 g of
//    fat at 2000 kcal — feeding the UI percent 27.5 would paint 6111 g);
//  - a null anywhere (blank field, no weight, delta with no TDEE) renders a
//    localized hint and NO numbers — never zeros.
//
// The component is pure (the page owns the hooks), so no supabase mock and no
// QueryClientProvider are needed here.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { PhasePreview } from './PhasePreview';
import type { PhaseDraft } from './PhaseEditorForm';

function draft(over: Partial<PhaseDraft> = {}): PhaseDraft {
  return {
    name: 'Cut Q3',
    phase_type: 'cut',
    start_date: '2026-06-01',
    end_date: null,
    kcal_mode: 'absolute',
    kcal_value: 2000,
    protein_g_per_kg: 2,
    fat_pct_of_kcal: 0.3,
    fiber_mode: 'fixed_g',
    fiber_value: 30,
    notes: null,
    ...over,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('PhasePreview — derived targets', () => {
  it('paints the targets from the real macro maths', () => {
    // weight 80, bf 25 → lean 60 kg → protein 60×2 = 120 g (480 kcal)
    // fat = 2000×0.3/9 → 67 g ; carbs = (2000−480−600)/4 = 230 g ; fiber 30 g
    render(<PhasePreview draft={draft()} weightKg={80} bodyFatPct={25} />);

    expect(screen.getByTestId('preview-kcal')).toHaveTextContent('2000');
    expect(screen.getByText('120 g')).toBeInTheDocument();
    expect(screen.getByText('230 g')).toBeInTheDocument();
    expect(screen.getByText('67 g')).toBeInTheDocument();
    expect(screen.getByText('30 g')).toBeInTheDocument();
  });

  it('consumes fat_pct_of_kcal as the DB fraction, never the UI percent', () => {
    // 0.275 of 2000 kcal = 550 kcal → 61 g. The UI percent (27.5) would give
    // 6111 g — the R-06 corruption, one layer downstream.
    render(
      <PhasePreview
        draft={draft({ fat_pct_of_kcal: 0.275 })}
        weightKg={80}
        bodyFatPct={25}
      />,
    );
    expect(screen.getByText('61 g')).toBeInTheDocument();
  });

  it('shows the TDEE delta chip and adds the delta to the estimate', () => {
    render(
      <PhasePreview
        draft={draft({ kcal_mode: 'tdee_delta', kcal_value: -300 })}
        weightKg={80}
        bodyFatPct={25}
        estimatedTdeeKcal={2500}
      />,
    );
    expect(screen.getByTestId('preview-kcal')).toHaveTextContent('2200');
    expect(screen.getByText(/TDEE/)).toBeInTheDocument();
  });
});

describe('PhasePreview — the honest empty states (never zeros)', () => {
  it('a blanked field → the incomplete hint, no numbers', () => {
    render(
      <PhasePreview draft={draft({ kcal_value: null })} weightKg={80} bodyFatPct={25} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      i18n.t('objetivos:phases.preview.incomplete'),
    );
    expect(screen.queryByTestId('preview-kcal')).not.toBeInTheDocument();
  });

  it('no weight logged → the needs-weight hint', () => {
    render(<PhasePreview draft={draft()} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      i18n.t('objetivos:phases.hero.needsWeight'),
    );
  });

  it('tdee_delta with no TDEE estimate → the needs-TDEE hint', () => {
    render(
      <PhasePreview
        draft={draft({ kcal_mode: 'tdee_delta', kcal_value: -300 })}
        weightKg={80}
        bodyFatPct={25}
        estimatedTdeeKcal={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      i18n.t('objetivos:phases.hero.needsTdee'),
    );
    expect(screen.queryByTestId('preview-kcal')).not.toBeInTheDocument();
  });

  it('offers the TDEE calculator only from the needsTdee dead end', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    // No weight → a different hint, no exit.
    const { unmount } = render(
      <PhasePreview
        draft={draft({ kcal_mode: 'tdee_delta', kcal_value: -300 })}
        weightKg={undefined}
        estimatedTdeeKcal={null}
        onOpenTdeeCalculator={onOpen}
      />,
    );
    expect(screen.queryByTestId('phase-preview-open-tdee')).toBeNull();
    unmount();

    // Delta mode with no estimate → the dead end, with a way out.
    render(
      <PhasePreview
        draft={draft({ kcal_mode: 'tdee_delta', kcal_value: -300 })}
        weightKg={80}
        estimatedTdeeKcal={null}
        onOpenTdeeCalculator={onOpen}
      />,
    );
    await user.click(screen.getByTestId('phase-preview-open-tdee'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
