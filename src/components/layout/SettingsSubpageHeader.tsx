import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SettingsSubpageHeader({ title }: { title: string }) {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-3">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('back')}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
    </div>
  );
}
