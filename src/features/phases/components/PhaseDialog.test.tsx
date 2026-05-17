// @vitest-environment jsdom
//
// Tier-2 component test (R-16, rides R-09) for the highest-value
// math-at-boundary form: PhaseDialog. Asserts the RHF + zodResolver wiring
// preserves behavior — fat-% / protein bounds reject bad input, valid submit
// ships the correct payload (fat percent → DB fraction via the R-06 helper),
// the R-02 notesOnly mode locks every non-notes field, and the R-05 protein
// prefill tracks phase_type. The mutation is a prop (onSave) — we spy it, not
// the schema.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM, pctToFraction } from '@/lib/macros';
import { PhaseDialog } from './PhaseDialog';
import type { Phase } from '../api';

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

function setup(props: Partial<Parameters<typeof PhaseDialog>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <PhaseDialog
      open
      onOpenChange={onOpenChange}
      onSave={onSave}
      phase={null}
      {...props}
    />,
  );
  return { onSave, onOpenChange };
}

describe('PhaseDialog (Tier-2)', () => {
  it('rejects an out-of-range fat % and does not call the mutation', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await user.type(screen.getByLabelText(i18n.t('objetivos:phases.form.name')), 'Cut Q3');

    const fat = screen.getByLabelText(i18n.t('objetivos:phases.form.fat'));
    await user.clear(fat);
    await user.type(fat, '99'); // schema bound is 10–60

    await user.click(
      screen.getByRole('button', { name: i18n.t('objetivos:phases.form.save') }),
    );

    // zodResolver blocks submit; the mutation prop is never invoked.
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
  });

  it('submits a valid phase with fat % converted to a DB fraction', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    // start_date defaults to today via isoDate(); only name + a valid fat
    // are needed for a valid submit (everything else has sane defaults).
    await user.type(
      screen.getByLabelText(i18n.t('objetivos:phases.form.name')),
      'Maintenance',
    );

    const fat = screen.getByLabelText(i18n.t('objetivos:phases.form.fat'));
    await user.clear(fat);
    await user.type(fat, '30');

    await user.click(
      screen.getByRole('button', { name: i18n.t('objetivos:phases.form.save') }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.name).toBe('Maintenance');
    // R-06: UI percent 30 → stored fraction 0.30 via pctToFraction.
    expect(payload.fat_pct_of_kcal).toBeCloseTo(pctToFraction(30), 10);
    expect(payload.fat_pct_of_kcal).toBeCloseTo(0.3, 10);
  });

  it('notesOnly mode disables every non-notes field but keeps notes editable', () => {
    setup({ notesOnly: true });

    expect(screen.getByLabelText(i18n.t('objetivos:phases.form.name'))).toBeDisabled();
    expect(
      screen.getByLabelText(i18n.t('objetivos:phases.form.startDate')),
    ).toBeDisabled();
    expect(screen.getByLabelText(i18n.t('objetivos:phases.form.fat'))).toBeDisabled();
    expect(
      screen.getByLabelText(i18n.t('objetivos:phases.form.protein')),
    ).toBeDisabled();
    // Notes stay editable forever (D-A5 / R-02).
    expect(
      screen.getByLabelText(i18n.t('objetivos:phases.form.notes')),
    ).not.toBeDisabled();
  });

  it('prefills protein g/kg from the phase-aware lean-mass table on a new phase', async () => {
    setup();
    const protein = screen.getByLabelText(
      i18n.t('objetivos:phases.form.protein'),
    ) as HTMLInputElement;
    // Default phase_type is "maintenance" → table default.
    await waitFor(() =>
      expect(Number(protein.value)).toBeCloseTo(
        PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.maintenance,
        10,
      ),
    );
  });

  it('does NOT re-anchor protein for an existing phase (keeps the stored value)', async () => {
    const stored: Phase = {
      id: 'p1',
      user_id: 'u1',
      name: 'Old cut',
      phase_type: 'cut',
      start_date: '2026-01-01',
      end_date: null,
      kcal_mode: 'absolute',
      kcal_value: 1800,
      protein_g_per_kg: 1.234, // deliberately not the table default
      fat_pct_of_kcal: 0.25,
      fiber_mode: 'fixed_g',
      fiber_value: 30,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as unknown as Phase;

    setup({ phase: stored });
    const protein = screen.getByLabelText(
      i18n.t('objetivos:phases.form.protein'),
    ) as HTMLInputElement;
    await waitFor(() => expect(Number(protein.value)).toBeCloseTo(1.234, 10));
  });
});
