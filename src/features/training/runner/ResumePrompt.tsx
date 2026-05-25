import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { RunnerState } from '@/core/runner';

interface Props {
  draft: RunnerState;
  nowMs: number;
  onResume: () => void;
  onDiscard: () => void;
}

/** Resume / discard a saved in-progress workout on reopen (spec §0.3). */
export function ResumePrompt({ draft, nowMs, onResume, onDiscard }: Props) {
  const { t } = useTranslation('entrenamiento');
  const minutes = Math.max(0, Math.round((nowMs - draft.savedAtMs) / 60000));
  const doneCount = draft.exercises.filter((e) => e.status === 'done').length;
  return (
    <div className="flex min-h-[60vh] flex-col justify-center gap-3">
      <div className="rounded-lg border p-4 text-center text-sm">
        {t('runner.resumeQuestion', { name: draft.routineName, minutes })}
        <div className="mt-2 text-muted-foreground">
          {t('runner.resumeProgress', { done: doneCount, total: draft.exercises.length })}
        </div>
      </div>
      <Button type="button" className="w-full" onClick={onResume}>{t('runner.resume')}</Button>
      <Button type="button" variant="destructive" className="w-full" onClick={onDiscard}>{t('runner.discard')}</Button>
    </div>
  );
}
