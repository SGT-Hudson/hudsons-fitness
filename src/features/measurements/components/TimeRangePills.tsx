import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TimeRange } from '../hooks';

interface Props {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
}

const RANGES: TimeRange[] = ['30d', '90d', '1y', 'all'];

export function TimeRangePills({ value, onChange }: Props) {
  const { t } = useTranslation('metricas');
  return (
    <div
      role="radiogroup"
      aria-label={t('charts.range.label')}
      className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs"
    >
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={cn(
            'px-2.5 py-1 rounded-sm transition-colors',
            value === r
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(`charts.range.${r}`)}
        </button>
      ))}
    </div>
  );
}
