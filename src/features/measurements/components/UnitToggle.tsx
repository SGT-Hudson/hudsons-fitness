import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { CompositionUnit } from '../composition';

interface Props {
  value: CompositionUnit;
  onChange: (next: CompositionUnit) => void;
}

const UNITS: CompositionUnit[] = ['pct', 'kg'];

// Per-chart-local state, no query-string, no persistence (D-C1 / D-D4 / D-D5).
// The %↔kg choice lives in the chart's own useState only.
export function UnitToggle({ value, onChange }: Props) {
  const { t } = useTranslation('metricas');
  return (
    <SegmentedControl
      ariaLabel={t('charts.composition.unit.label')}
      options={UNITS.map((u) => ({ value: u, label: t(`charts.composition.unit.${u}`) }))}
      value={value}
      onChange={onChange}
    />
  );
}
