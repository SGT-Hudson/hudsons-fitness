import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/hooks/use-media-query';

export function HomePage() {
  const { t } = useTranslation('nav');
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (!isDesktop) return <Navigate to="/diary" replace />;

  // Placeholder — the unified Nutrición + Entreno dashboard is item 4.
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('home')}</h1>
      <p className="text-muted-foreground">{t('inProgress.body')}</p>
    </div>
  );
}
