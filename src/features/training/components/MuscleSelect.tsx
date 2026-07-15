import { useTranslation } from 'react-i18next';
import { MUSCLE_GROUPS, codesInGroup } from '@/core/muscles';

interface Props {
  /** '' | <fineCode> | `group:<group>` */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

/** The grouped All/group/fine-code muscle dropdown shared by the picker + browse filters. */
export function MuscleSelect({ value, onChange, ariaLabel, className }: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <select
      role="combobox"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        'w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring'
      }
    >
      <option value="">{t('picker.allMuscles')}</option>
      {MUSCLE_GROUPS.map((g) => (
        <optgroup key={g} label={t(`exerciseDialog.muscleGroup.${g}`)}>
          <option value={`group:${g}`}>
            {t('picker.allInGroup', { group: t(`exerciseDialog.muscleGroup.${g}`) })}
          </option>
          {codesInGroup(g).map((code) => (
            <option key={code} value={code}>
              {t(`exerciseDialog.muscle.${code}`)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
