import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionList } from '@/features/training/components/SessionList';

export function EntrenamientoPage() {
  const { t } = useTranslation('entrenamiento');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('page.title')}</h1>
        <Button asChild>
          <Link to="/training/new">
            <Plus className="h-4 w-4 mr-1" />
            {t('page.newSession')}
          </Link>
        </Button>
      </div>
      <SessionList />
    </div>
  );
}
