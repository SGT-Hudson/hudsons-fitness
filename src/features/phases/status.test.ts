// Tier-1: the phase status rules and R-02's freeze window. These were page-local
// helpers in `ObjetivosPage`; they are domain logic (they decide what a phase is
// and whether history is still editable), so they live in the feature and are
// pinned here — not incidentally, through a page render.
import { describe, it, expect } from 'vitest';
import {
  PHASE_EDIT_GRACE_DAYS,
  isPhaseFrozen,
  phaseStatus,
} from './status';

const TODAY = '2026-07-14';

function dates(start_date: string, end_date: string | null) {
  return { start_date, end_date };
}

describe('phaseStatus', () => {
  it('a phase starting after today is upcoming', () => {
    expect(phaseStatus(dates('2026-08-01', '2026-09-30'), TODAY)).toBe('upcoming');
  });

  it('a phase that ended before today is past', () => {
    expect(phaseStatus(dates('2026-01-01', '2026-03-31'), TODAY)).toBe('past');
  });

  it('a phase spanning today is active', () => {
    expect(phaseStatus(dates('2026-07-01', '2026-08-31'), TODAY)).toBe('active');
  });

  it('an open-ended phase that has started is active', () => {
    expect(phaseStatus(dates('2026-01-05', null), TODAY)).toBe('active');
  });

  // Boundary days belong to the phase (the DB daterange is inclusive `[]`).
  it('is active on its own start and end day', () => {
    expect(phaseStatus(dates(TODAY, '2026-08-01'), TODAY)).toBe('active');
    expect(phaseStatus(dates('2026-06-01', TODAY), TODAY)).toBe('active');
  });
});

describe('isPhaseFrozen (R-02)', () => {
  it('never freezes an active or open-ended phase', () => {
    expect(isPhaseFrozen(dates('2026-07-01', '2026-08-31'), TODAY)).toBe(false);
    expect(isPhaseFrozen(dates('2026-01-05', null), TODAY)).toBe(false);
  });

  it('never freezes an upcoming phase', () => {
    expect(isPhaseFrozen(dates('2026-08-01', '2026-09-30'), TODAY)).toBe(false);
  });

  it('stays editable inside the grace window', () => {
    // Ended exactly PHASE_EDIT_GRACE_DAYS ago: still inside the window.
    expect(isPhaseFrozen(dates('2026-05-01', '2026-07-07'), TODAY)).toBe(false);
    expect(PHASE_EDIT_GRACE_DAYS).toBe(7);
  });

  it('freezes one day past the grace window', () => {
    expect(isPhaseFrozen(dates('2026-05-01', '2026-07-06'), TODAY)).toBe(true);
  });

  it('freezes a long-past phase', () => {
    expect(isPhaseFrozen(dates('2025-01-01', '2025-03-31'), TODAY)).toBe(true);
  });
});
