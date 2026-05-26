import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MUSCLE_CODES, type MuscleCode } from '@/core/muscleVolume';
import { useProfile } from '@/features/profile/hooks';
import { MuscleBody } from './MuscleBody';
import { muscleColor } from './muscleColor';
import { useMuscleVolume, type MuscleWindow } from './hooks';
import type { Gender } from './skins/types';

const WINDOWS: MuscleWindow[] = ['7d', '30d', '6mo', 'all'];
const GENDERS: Gender[] = ['male', 'female'];

function emptyByMuscle(): Record<MuscleCode, number> {
  return Object.fromEntries(MUSCLE_CODES.map((m) => [m, 0])) as Record<MuscleCode, number>;
}

export function MuscleActivityView() {
  const { t } = useTranslation('entrenamiento');
  const { data: profile } = useProfile();
  const [win, setWin] = useState<MuscleWindow>('30d');
  const [gender, setGender] = useState<Gender>(profile?.sex === 'female' ? 'female' : 'male');
  const vol = useMuscleVolume(win);

  const byMuscle = vol.data?.byMuscle ?? emptyByMuscle();
  const max = vol.data?.maxMuscleValue ?? 0;
  const ranked = [...MUSCLE_CODES]
    .map((m) => [m, byMuscle[m]] as const)
    .sort((a, b) => b[1] - a[1]);
  const empty = (vol.data?.totalWorkingSets ?? 0) === 0;
  const fullBody = vol.data?.fullBodySetCount ?? 0;

  const pill = (active: boolean) =>
    cn(
      'px-2.5 py-1 rounded-sm transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label={t('muscleMap.window.label')}
          className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs"
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={win === w}
              onClick={() => setWin(w)}
              className={pill(win === w)}
            >
              {t(`muscleMap.window.${w}`)}
            </button>
          ))}
        </div>
        <div
          role="radiogroup"
          aria-label={t('muscleMap.gender.label')}
          className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs"
        >
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={gender === g}
              onClick={() => setGender(g)}
              className={pill(gender === g)}
            >
              {t(`muscleMap.gender.${g}`)}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">{t('muscleMap.empty')}</p>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex gap-2">
            <MuscleBody intensityByMuscle={byMuscle} max={max} gender={gender} side="front" />
            <MuscleBody intensityByMuscle={byMuscle} max={max} gender={gender} side="back" />
          </div>
          <div className="min-w-[200px] flex-1">
            <ul className="text-sm">
              {ranked.map(([m, v]) => (
                <li key={m} className="flex items-center gap-2 py-1">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ background: muscleColor(v, max) }}
                  />
                  <span className="flex-1">{t(`exerciseDialog.primaryMuscle.${m}`)}</span>
                  <strong>{Number.isInteger(v) ? v : v.toFixed(1)}</strong>
                  <span className="text-muted-foreground">{t('muscleMap.setsUnit')}</span>
                </li>
              ))}
            </ul>
            {fullBody > 0 && (
              <p className="mt-3 border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
                {t('muscleMap.fullBodyFootnote', { count: fullBody })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
