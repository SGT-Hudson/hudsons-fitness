import { useTranslation } from 'react-i18next';
import { Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, type Locale } from '@/lib/dates';
import { useDeleteMeasurement } from '../hooks';
import type { BodyMeasurement } from '../api';

interface Props {
  measurements: BodyMeasurement[];
  loading: boolean;
  onEdit: (m: BodyMeasurement) => void;
}

export function MeasurementsList({ measurements, loading, onEdit }: Props) {
  const { t, i18n } = useTranslation('metricas');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const del = useDeleteMeasurement();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('list.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
        ) : measurements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('list.empty')}</p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-2 font-medium">{t('fields.date')}</th>
                  <th className="px-3 py-2 font-medium text-right">{t('fields.weightKg')}</th>
                  <th className="px-3 py-2 font-medium text-right">{t('fields.bodyFatPct')}</th>
                  <th className="px-3 py-2 font-medium text-right">{t('fields.musclePct')}</th>
                  <th className="px-3 py-2 font-medium text-right">{t('fields.waterPct')}</th>
                  <th className="px-6 py-2 font-medium text-right">{t('list.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {measurements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-6 py-2 whitespace-nowrap">
                      {formatDate(m.measured_on, 'd MMM yyyy', locale)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.weight_kg ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.body_fat_pct ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.muscle_pct ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.water_pct ?? '—'}</td>
                    <td className="px-6 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tCommon('edit')}
                          onClick={() => onEdit(m)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tCommon('delete')}
                          disabled={del.isPending}
                          onClick={() => {
                            if (window.confirm(t('list.deleteConfirm'))) {
                              del.mutate(m.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
