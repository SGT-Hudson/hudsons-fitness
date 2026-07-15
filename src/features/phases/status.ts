import { daysBetween } from '@/lib/dates';
import type { Phase } from './api';

export type PhaseStatus = 'active' | 'past' | 'upcoming';

/** The only fields the status rules read — so callers (and tests) need no full row. */
type PhaseDates = Pick<Phase, 'start_date' | 'end_date'>;

/**
 * Where a phase sits relative to `today` (both ISO `yyyy-MM-dd`, so string
 * comparison is chronological). The DB's exclusion constraint keeps at most one
 * phase `active`; an open-ended phase (`end_date === null`) stays active forever.
 */
export function phaseStatus(phase: PhaseDates, today: string): PhaseStatus {
  if (phase.start_date > today) return 'upcoming';
  if (phase.end_date && phase.end_date < today) return 'past';
  return 'active';
}

/**
 * Grace window after a phase's `end_date` during which it stays fully
 * editable and deletable. Past phases are computationally inert (no code
 * reconstructs which phase was active on a historical date — see D-A5), so
 * the freeze is a UX stance ("history is closed"), not a data invariant.
 * That justifies a forgiving late-correction window before the card freezes.
 */
export const PHASE_EDIT_GRACE_DAYS = 7;

/**
 * A phase is frozen only once it ended more than PHASE_EDIT_GRACE_DAYS ago.
 * Frozen → edit/delete affordances hidden + row dimmed. The status badge
 * stays `end_date`-based (a frozen phase still reads "past"); only the
 * freeze/dim is grace-based. Notes stay editable forever regardless (D-A5).
 */
export function isPhaseFrozen(phase: PhaseDates, today: string): boolean {
  if (!phase.end_date || phase.end_date >= today) return false;
  return daysBetween(phase.end_date, today) > PHASE_EDIT_GRACE_DAYS;
}
