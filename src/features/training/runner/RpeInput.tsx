import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { RpeExplainer } from './RpeExplainer';

const VALUES = [6, 7, 8, 9, 10] as const;

interface Props {
  value: number | null;
  targetRpe: number | null;
  onChange: (rpe: number | null) => void;
}

/** Self-describing RPE picker (working sets only). Tapping the active chip
 *  clears it (RPE is always optional). Anchored copy via RpeExplainer. */
export function RpeInput({ value, targetRpe, onChange }: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{t('rpe.label')}</span>
        {targetRpe != null && <span>· {t('rpe.target', { value: targetRpe })}</span>}
        <RpeExplainer />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {VALUES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value === v ? null : v)}
            className={cn(
              'rounded-md border px-2 py-1 text-xs',
              value === v ? 'border-primary bg-primary/10 font-medium' : 'border-input',
            )}
          >
            {v}
          </button>
        ))}
      </div>
      {value != null && (
        <p className="text-xs text-muted-foreground">{t(`rpe.anchorInline.${value}`, { defaultValue: '' })}</p>
      )}
    </div>
  );
}
