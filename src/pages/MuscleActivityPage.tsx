import { useTranslation } from 'react-i18next';
import { MuscleActivityView } from '@/features/training/muscleMap/MuscleActivityView';

export function MuscleActivityPage() {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('muscleMap.title')}</h1>
      <MuscleActivityView />
    </div>
  );
}
