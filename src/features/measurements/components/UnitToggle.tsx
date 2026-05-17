import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { CompositionUnit } from '../composition';

interface Props {
  value: CompositionUnit;
  onChange: (next: CompositionUnit) => void;
}

const UNITS: CompositionUnit[] = ['pct', 'kg'];

// Mirrors the TimeRangePills pattern: per-chart-local state, no query-string,
// no persistence (D-C1 / D-D4 / D-D5). The %↔kg choice lives in the chart's
// own useState only.
export function UnitToggle({ value, onChange }: Props) {
  const { t } = useTranslation('metricas');
  return (
    <div
      role="radiogroup"
      aria-label={t('charts.composition.unit.label')}
      className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs"
    >
      {UNITS.map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          onClick={() => onChange(u)}
          className={cn(
            'px-2.5 py-1 rounded-sm transition-colors',
            value === u
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(`charts.composition.unit.${u}`)}
        </button>
      ))}
    </div>
  );
}
