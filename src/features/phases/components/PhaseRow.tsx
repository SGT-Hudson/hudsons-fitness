import { useTranslation } from 'react-i18next';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhaseChip } from '@/components/ui/PhaseChip';
import { cn } from '@/lib/utils';
import { formatDate, type Locale } from '@/lib/dates';
import type { PhaseType } from '@/core/nutritionTone';
import type { Phase } from '../api';

export type PhaseRowStatus = 'active' | 'past' | 'upcoming';

/** The phase-coloured left rail — identity, not state. */
const RAIL_TONE: Record<PhaseType, string> = {
  cut: 'border-l-phase-cut',
  bulk: 'border-l-phase-bulk',
  maintenance: 'border-l-phase-maint',
};

/** The status chip: the accent (nutri) marks the live phase; the rest stay quiet. */
const STATUS_TONE: Record<PhaseRowStatus, string> = {
  active: 'border-accent-line bg-accent-soft text-accent-ink',
  upcoming: 'border-border bg-muted text-muted-foreground',
  past: 'border-border bg-transparent text-text-dim',
};

interface Props {
  phase: Phase;
  status: PhaseRowStatus;
  /**
   * R-02: a phase whose `end_date` is more than the grace window in the past.
   * Frozen rows dim, lose edit/delete, and keep only the notes affordance —
   * notes stay editable forever (D-A5).
   */
  frozen: boolean;
  onEdit: (phase: Phase) => void;
  onEditNotes: (phase: Phase) => void;
  onDelete: (phase: Phase) => void;
  deleting?: boolean;
}

/**
 * One phase in the list: phase-tinted rail + type chip, the status chip, the
 * date range, and the two numbers that define the phase (kcal/day and protein
 * g/kg). Everything here is stored data — no target is derived in this row;
 * the derived daily targets belong to the hero, which reads them from
 * `computePhaseTargets`.
 */
export function PhaseRow({
  phase,
  status,
  frozen,
  onEdit,
  onEditNotes,
  onDelete,
  deleting,
}: Props) {
  const { t, i18n } = useTranslation('objetivos');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const statusLabel = t(`phases.row.status.${frozen ? 'past' : status}`);

  return (
    <article
      className={cn(
        'flex items-start gap-3 rounded-[14px] border border-l-[3px] bg-card p-3 md:items-center md:gap-4 md:p-4',
        RAIL_TONE[phase.phase_type as PhaseType],
        frozen && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <PhaseChip phase={phase.phase_type as PhaseType} />
          <h3 className="text-title-card min-w-0 truncate">{phase.name}</h3>
          <span
            className={cn(
              'inline-flex h-[18px] shrink-0 items-center rounded-full border px-2 text-[9.5px] font-medium uppercase tracking-[0.04em]',
              STATUS_TONE[frozen ? 'past' : status],
            )}
          >
            {statusLabel}
          </span>
        </div>

        <p className="tnum mt-1 text-xs text-text-dim">
          {formatDate(phase.start_date, 'd MMM yyyy', locale)}
          {' → '}
          {phase.end_date ? formatDate(phase.end_date, 'd MMM yyyy', locale) : '∞'}
        </p>

        <div className="tnum mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            {phase.kcal_mode === 'tdee_delta' && `${t('phases.summary.tdeePrefix')} `}
            <b className="font-semibold text-foreground">
              {phase.kcal_mode === 'tdee_delta' && phase.kcal_value > 0 ? '+' : ''}
              {phase.kcal_value}
            </b>{' '}
            {t('phases.row.kcalPerDay')}
          </span>
          <span>
            {t('phases.row.proteinPrefix')}{' '}
            <b className="font-semibold text-foreground">{phase.protein_g_per_kg}</b>{' '}
            {t('phases.row.proteinUnit')}
          </span>
        </div>

        {phase.notes && (
          <p className="mt-1 truncate text-xs text-text-dim">{phase.notes}</p>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        {frozen ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => onEditNotes(phase)}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('phases.editNotes')}
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              title={t('phases.edit')}
              aria-label={t('phases.edit')}
              onClick={() => onEdit(phase)}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={t('phases.delete')}
              aria-label={t('phases.delete')}
              onClick={() => onDelete(phase)}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
