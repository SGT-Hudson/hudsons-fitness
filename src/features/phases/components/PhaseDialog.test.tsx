// @vitest-environment jsdom
//
// Tier-2 component test (R-16, rides R-09) for the highest-value
// math-at-boundary form: PhaseDialog. Asserts the RHF + zodResolver wiring
// preserves behavior — fat-% / protein bounds reject bad input, valid submit
// ships the correct payload (fat percent → DB fraction via the R-06 helper),
// the R-02 notesOnly mode locks every non-notes field, and the R-05 protein
// prefill tracks phase_type. The mutation is a prop (onSave) — we spy it, not
// the schema.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM, pctToFraction } from '@/lib/macros';
import { PhaseDialog } from './PhaseDialog';
import type { Phase } from '../api';

// PhaseDialog's `start_date` defaults to the project's canonical Europe/Madrid
// "today" (`todayInTZ`). Freeze the clock at a fixed mid-day-UTC instant so
// that default is deterministic regardless of the host timezone (CI runs
// UTC; near a UTC/Madrid midnight boundary the date would otherwise drift).
// 2026-05-15T12:00:00Z is 2026-05-15 under both UTC and Europe/Madrid.
const FROZEN_NOW = new Date('2026-05-15T12:00:00Z');

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
  await i18n.changeLanguage('es');
});

afterEach(() => {
  vi.useRealTimers();
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
    // R-06: the field is a STRING now (the fields dropped `valueAsNumber` when
    // they became `type="text"`), so the schema parses it — but the percent →
    // fraction conversion is still pctToFraction's alone, at the form boundary.
    expect(payload.fat_pct_of_kcal).toBeCloseTo(pctToFraction(30), 10);
    expect(payload.fat_pct_of_kcal).toBeCloseTo(0.3, 10);
    // The other migrated fields keep shipping numbers, not strings.
    expect(payload.protein_g_per_kg).toBe(
      PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.maintenance,
    );
    expect(payload.kcal_value).toBe(2000);
    expect(payload.fiber_value).toBe(30);
  });

  // The decimal-comma fix, on the field hard invariant 6 was written for. A
  // Spanish keyboard puts `,` on the numeric keypad, so `27,5` is what a user
  // types. On the old `type="number"` element the browser stripped the comma
  // before RHF saw it (`27,5` → `"275"`) — and `valueAsNumber` on a real comma
  // returns NaN, so neither half of the fix works without the other.
  //
  // Assert the SUBMITTED PAYLOAD, never the field's own value: a comma there is
  // only corruption once it reaches the number.
  it('accepts a decimal comma in every migrated phase field (fat 27,5 → fraction 0.275)', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await user.type(screen.getByLabelText(i18n.t('objetivos:phases.form.name')), 'Cut');

    const kcal = screen.getByLabelText(i18n.t('objetivos:phases.form.kcal'));
    await user.clear(kcal);
    await user.type(kcal, '2500,5');

    const protein = screen.getByLabelText(i18n.t('objetivos:phases.form.protein'));
    await user.clear(protein);
    await user.type(protein, '2,2');

    const fat = screen.getByLabelText(i18n.t('objetivos:phases.form.fat'));
    await user.clear(fat);
    await user.type(fat, '27,5');

    const fiber = screen.getByLabelText(i18n.t('objetivos:phases.form.fiber'));
    await user.clear(fiber);
    await user.type(fiber, '35,5');

    await user.click(
      screen.getByRole('button', { name: i18n.t('objetivos:phases.form.save') }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    // R-06 headline: 27,5 % → 0.275, NOT 2.75 (comma eaten → 275) and NOT NaN.
    expect(payload.fat_pct_of_kcal).toBeCloseTo(0.275, 10);
    expect(payload.fat_pct_of_kcal).toBeCloseTo(pctToFraction(27.5), 10);
    expect(payload.kcal_value).toBeCloseTo(2500.5, 10);
    expect(payload.protein_g_per_kg).toBeCloseTo(2.2, 10);
    expect(payload.fiber_value).toBeCloseTo(35.5, 10);
  });

  // `type="text"` drops the native min/max gates, so zod is the only thing left
  // enforcing them. protein's max (4 g/kg) lived ONLY in the DOM before this
  // change — this test is what keeps it from silently disappearing.
  it('rejects a protein g/kg above the 4 g/kg bound (the gate the DOM used to own)', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await user.type(screen.getByLabelText(i18n.t('objetivos:phases.form.name')), 'Cut');

    const protein = screen.getByLabelText(i18n.t('objetivos:phases.form.protein'));
    await user.clear(protein);
    await user.type(protein, '5');

    await user.click(
      screen.getByRole('button', { name: i18n.t('objetivos:phases.form.save') }),
    );

    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
    expect(
      screen.getByText(i18n.t('objetivos:phases.form.errors.protein')),
    ).toBeInTheDocument();
  });

  // Blank semantics: a required numeric field left empty must still block the
  // save (it did before as `NaN` → z.number() rejected). Blank must never
  // become 0 or null here.
  it('does not submit when a required numeric field is left blank', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await user.type(screen.getByLabelText(i18n.t('objetivos:phases.form.name')), 'Cut');
    await user.clear(screen.getByLabelText(i18n.t('objetivos:phases.form.fat')));

    await user.click(
      screen.getByRole('button', { name: i18n.t('objetivos:phases.form.save') }),
    );

    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
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

  // The fat field used to be integer-only (`step="1"`), so the prefill rounded.
  // Now that it accepts a fraction, rounding on prefill would silently rewrite
  // a stored 0.275 to 0.28 on the next save. `fat_pct_of_kcal` is numeric(4,3),
  // so one decimal of percent is exactly storable — keep it.
  it('prefills a fractional fat % without rounding it away (0.275 → 27.5)', async () => {
    const stored = {
      id: 'p2',
      user_id: 'u1',
      name: 'Cut',
      phase_type: 'cut',
      start_date: '2026-01-01',
      end_date: null,
      kcal_mode: 'absolute',
      kcal_value: 1800,
      protein_g_per_kg: 2.4,
      fat_pct_of_kcal: 0.275,
      fiber_mode: 'fixed_g',
      fiber_value: 30,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as unknown as Phase;

    setup({ phase: stored });
    const fat = screen.getByLabelText(
      i18n.t('objetivos:phases.form.fat'),
    ) as HTMLInputElement;
    await waitFor(() => expect(fat.value).toBe('27.5'));
  });
});
