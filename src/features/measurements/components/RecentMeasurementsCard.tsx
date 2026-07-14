import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate, type Locale } from '@/lib/dates';
import type { BodyMeasurement } from '../api';

/** The P0 card is a glance, not an archive — the archive is `/progress/history`. */
const PREVIEW_ROWS = 5;

interface Props {
  /** Recent measurements, newest first (only the first five are drawn). */
  measurements: BodyMeasurement[];
  loading: boolean;
  onEdit: (m: BodyMeasurement) => void;
}

/**
 * The Progreso P0 history card: the last five measurements, flat, and a
 * "Historial" button into the full month-grouped screen. Deleting a measurement
 * lives there (one destructive affordance, one place); a row-level edit stays
 * here because logging a correction from the page you just logged on is the
 * common case.
 */
export function RecentMeasurementsCard({ measurements, loading, onEdit }: Props) {
  const { t, i18n } = useTranslation('metricas');
  const { t: tCommon } = useTranslation('common');
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';

  const rows = measurements.slice(0, PREVIEW_ROWS);

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-cap-label">{t('list.title')}</span>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-0.5 px-2 text-[12px] text-text-dim hover:text-foreground"
        >
          <Link to="/progress/history">
            {t('history.open')}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('list.empty')}</p>
      ) : (
        <ul className="-mb-1">
          {rows.map((m) => (
            <li
              key={m.id}
              className="flex items-baseline gap-2 border-t py-1.5 first:border-t-0 first:pt-0"
            >
              <span className="w-[86px] shrink-0 text-[12px] font-semibold">
                {formatDate(m.measured_on, 'd MMM yyyy', locale)}
              </span>
              <span className="tnum flex-1 text-[13px] font-medium">
                {m.weight_kg == null ? '—' : `${m.weight_kg} kg`}
              </span>
              <span className="tnum text-[12px] text-text-dim">
                {m.body_fat_pct == null ? '—' : `${m.body_fat_pct} %`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 self-center text-text-dim hover:text-foreground"
                aria-label={tCommon('edit')}
                onClick={() => onEdit(m)}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
