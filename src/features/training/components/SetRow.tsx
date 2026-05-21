import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { CoreSessionSet } from '@/core/training';
import { cn } from '@/lib/utils';
import type { SessionFormValues } from '../schema';

interface Props {
  blockIndex: number;
  setIndex: number;
  /** Last working set for this exercise across the user's history (spec §6). */
  placeholder: CoreSessionSet | null;
  onRemove: () => void;
  showRemove: boolean;
}

function num(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  return String(v);
}

/**
 * One set's input row. Inputs are RHF-bound via the parent form context;
 * the placeholder (spec §6, the Hevy pattern) shows the last working
 * set's values as greyed placeholder text, and "Use last" commits all
 * four values into the form state in one tap.
 */
export function SetRow({ blockIndex, setIndex, placeholder, onRemove, showRemove }: Props) {
  const { t } = useTranslation('entrenamiento');
  const { register, setValue, watch } = useFormContext<SessionFormValues>();

  const basePath = `blocks.${blockIndex}.sets.${setIndex}` as const;
  const isWarmup = watch(`${basePath}.is_warmup`);

  function useLast() {
    if (!placeholder) return;
    setValue(`${basePath}.reps`, Number(placeholder.reps) || 0, { shouldValidate: true });
    setValue(`${basePath}.weight_kg`, Number(placeholder.weightKg) || 0, { shouldValidate: true });
    setValue(
      `${basePath}.rpe`,
      placeholder.rpe === null || placeholder.rpe === '' ? null : Number(placeholder.rpe),
      { shouldValidate: true },
    );
    setValue(`${basePath}.is_warmup`, false, { shouldValidate: true });
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[2rem_1fr_1fr_1fr_auto_auto] gap-2 items-end',
        isWarmup && 'opacity-70',
      )}
    >
      <div className="text-xs text-muted-foreground pb-2 tabular-nums">{setIndex + 1}</div>

      <div className="space-y-1">
        {setIndex === 0 && (
          <Label htmlFor={`${basePath}-reps`} className="text-xs">
            {t('setRow.reps')}
          </Label>
        )}
        <Input
          id={`${basePath}-reps`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder={placeholder ? num(placeholder.reps) : ''}
          {...register(`${basePath}.reps`, { valueAsNumber: true })}
        />
      </div>

      <div className="space-y-1">
        {setIndex === 0 && (
          <Label htmlFor={`${basePath}-weight`} className="text-xs">
            {t('setRow.weightKg')}
          </Label>
        )}
        <Input
          id={`${basePath}-weight`}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          placeholder={placeholder ? num(placeholder.weightKg) : ''}
          {...register(`${basePath}.weight_kg`, { valueAsNumber: true })}
        />
      </div>

      <div className="space-y-1">
        {setIndex === 0 && (
          <Label htmlFor={`${basePath}-rpe`} className="text-xs">
            {t('setRow.rpe')}
          </Label>
        )}
        <Input
          id={`${basePath}-rpe`}
          type="number"
          inputMode="decimal"
          min={6}
          max={10}
          step={0.5}
          placeholder={placeholder?.rpe != null ? num(placeholder.rpe) : ''}
          {...register(`${basePath}.rpe`, {
            setValueAs: (v) => {
              if (v === '' || v === null || v === undefined) return null;
              const n = Number(v);
              return Number.isFinite(n) ? n : null;
            },
          })}
        />
      </div>

      <label className="flex flex-col items-center text-xs pb-2 cursor-pointer">
        {setIndex === 0 && <span className="mb-1">{t('setRow.warmup')}</span>}
        <input
          type="checkbox"
          className="h-4 w-4"
          {...register(`${basePath}.is_warmup`)}
        />
      </label>

      <div className="flex flex-col gap-1 pb-1">
        {setIndex === 0 && placeholder && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={useLast}
            title={t('setRow.useLastTooltip')}
          >
            {t('setRow.useLast')}
          </Button>
        )}
        {showRemove && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground"
            aria-label={t('setRow.remove')}
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
