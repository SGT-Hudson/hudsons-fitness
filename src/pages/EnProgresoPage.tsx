import { useTranslation } from 'react-i18next';
import { Hammer } from 'lucide-react';

export function EnProgresoPage() {
  const { t } = useTranslation('nav');
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
      <Hammer className="h-10 w-10" />
      <h1 className="text-2xl font-bold text-foreground">{t('inProgress.title')}</h1>
      <p className="max-w-sm text-sm">{t('inProgress.body')}</p>
    </div>
  );
}
