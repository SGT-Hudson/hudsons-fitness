import { useTranslation } from 'react-i18next';
import { MUSCLE_GROUPS, codesInGroup, type MuscleGroup } from '@/core/muscles';
import { cn } from '@/lib/utils';

export interface MuscleTagValue {
  primary: string[];
  secondary: string[];
}

interface Props {
  value: MuscleTagValue;
  onChange: (next: MuscleTagValue) => void;
}

type State = 'p' | 's' | null;

export function MuscleTagField({ value, onChange }: Props) {
  const { t } = useTranslation('entrenamiento');
  const isFullBody = value.primary.includes('full_body');

  function stateOf(code: string): State {
    if (value.primary.includes(code)) return 'p';
    if (value.secondary.includes(code)) return 's';
    return null;
  }

  function cycle(code: string) {
    const cur = stateOf(code);
    const primary = value.primary.filter((c) => c !== code && c !== 'full_body');
    const secondary = value.secondary.filter((c) => c !== code);
    if (cur === null) primary.push(code);
    else if (cur === 'p') secondary.push(code);
    // cur === 's' → leave both removed (neutral)
    onChange({ primary, secondary });
  }

  function toggleFullBody() {
    onChange(isFullBody ? { primary: [], secondary: [] } : { primary: ['full_body'], secondary: [] });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('exerciseDialog.muscleTag.instruction')}</p>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-primary" />
          {t('exerciseDialog.muscleTag.legendPrimary')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-primary" />
          {t('exerciseDialog.muscleTag.legendSecondary')}
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isFullBody} onChange={toggleFullBody} />
        {t('exerciseDialog.muscle.full_body')}
      </label>

      <fieldset disabled={isFullBody} className={cn(isFullBody && 'opacity-40')}>
        {MUSCLE_GROUPS.map((g: MuscleGroup) => (
          <div key={g} className="mb-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`exerciseDialog.muscleGroup.${g}`)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {codesInGroup(g).map((code) => {
                const st = stateOf(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={st !== null}
                    onClick={() => cycle(code)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      st === 'p' && 'border-primary bg-primary font-semibold text-primary-foreground',
                      st === 's' && 'border-primary font-semibold text-primary',
                      st === null && 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`exerciseDialog.muscle.${code}`)}
                    {st && (
                      <span className="rounded-full bg-background/30 px-1.5 py-px text-[10px] font-bold uppercase">
                        {st === 'p'
                          ? t('exerciseDialog.muscleTag.badgePrimary')
                          : t('exerciseDialog.muscleTag.badgeSecondary')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
