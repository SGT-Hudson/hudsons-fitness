// @vitest-environment jsdom
//
// Tier-2: the phase row's affordances. The freeze rule itself (R-02's grace
// window) is the page's; this pins what a frozen row is ALLOWED to offer —
// notes only, never edit/delete — plus the two numbers the row promises.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import type { Phase } from '../api';
import { PhaseRow } from './PhaseRow';

const phase: Phase = {
  id: 'p1',
  user_id: 'u1',
  name: 'Corte primavera',
  phase_type: 'cut',
  start_date: '2026-03-01',
  end_date: '2026-04-12',
  kcal_mode: 'absolute',
  kcal_value: 2180,
  protein_g_per_kg: 2.4,
  fat_pct_of_kcal: 0.28,
  fiber_mode: 'fixed_g',
  fiber_value: 30,
  notes: null,
  created_at: '2026-03-01T00:00:00Z',
};

function renderRow(overrides: Partial<React.ComponentProps<typeof PhaseRow>> = {}) {
  const props = {
    phase,
    status: 'active' as const,
    frozen: false,
    onEdit: vi.fn(),
    onEditNotes: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<PhaseRow {...props} />);
  return props;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('PhaseRow (Tier-2)', () => {
  it('shows the stored kcal/day and protein g/kg, the type chip and the status chip', () => {
    renderRow();

    expect(screen.getByText('2180')).toBeInTheDocument();
    expect(screen.getByText('2.4')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('objetivos:phases.type.cut'))).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t('objetivos:phases.row.status.active')),
    ).toBeInTheDocument();
  });

  it('tints the rail with the phase colour (identity, not state)', () => {
    const { container } = render(
      <PhaseRow
        phase={{ ...phase, phase_type: 'bulk' }}
        status="upcoming"
        frozen={false}
        onEdit={vi.fn()}
        onEditNotes={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.firstElementChild?.className).toContain('border-l-phase-bulk');
  });

  it('offers edit and delete on a live row, and calls them', async () => {
    const user = userEvent.setup();
    const props = renderRow();

    await user.click(screen.getByRole('button', { name: i18n.t('objetivos:phases.edit') }));
    await user.click(screen.getByRole('button', { name: i18n.t('objetivos:phases.delete') }));

    expect(props.onEdit).toHaveBeenCalledWith(phase);
    expect(props.onDelete).toHaveBeenCalledWith(phase);
  });

  // R-02: past the grace window the row freezes — notes stay editable forever
  // (D-A5), everything else is closed. This is the guarantee, not the styling.
  it('a frozen row offers "editar notas" and NOT edit/delete', async () => {
    const user = userEvent.setup();
    const props = renderRow({ frozen: true, status: 'past' });

    const notes = screen.getByRole('button', {
      name: i18n.t('objetivos:phases.editNotes'),
    });
    await user.click(notes);
    expect(props.onEditNotes).toHaveBeenCalledWith(phase);

    expect(
      screen.queryByRole('button', { name: i18n.t('objetivos:phases.edit') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n.t('objetivos:phases.delete') }),
    ).not.toBeInTheDocument();
  });
});
