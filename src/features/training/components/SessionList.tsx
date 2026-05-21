import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, type Locale } from '@/lib/dates';
import { useDeleteSession, useSessions } from '../hooks';

export function SessionList() {
  const { t, i18n } = useTranslation('entrenamiento');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const sessions = useSessions();
  const del = useDeleteSession();
  const [confirming, setConfirming] = useState<string | null>(null);

  if (sessions.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if ((sessions.data ?? []).length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-3">{t('list.emptyTitle')}</p>
        <Button asChild>
          <Link to="/training/new">{t('list.cta')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {(sessions.data ?? []).map((s) => (
        <li key={s.id} className="flex items-center gap-3 p-3">
          <Link to={`/training/${s.id}`} className="flex-1 min-w-0">
            <div className="font-medium truncate">{s.title ?? t('list.untitled')}</div>
            <div className="text-xs text-muted-foreground">
              {formatDate(s.performed_on, 'EEEE d MMM yyyy', locale)}
            </div>
          </Link>
          <Badge variant="outline" className="tabular-nums">
            {t('list.setCount', { count: s.set_count })}
          </Badge>
          <Button asChild size="icon" variant="ghost" aria-label={t('list.edit')}>
            <Link to={`/training/${s.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          {confirming === s.id ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  del.mutate(s.id);
                  setConfirming(null);
                }}
              >
                {t('list.confirmDelete')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                {t('list.cancel')}
              </Button>
            </div>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('list.delete')}
              onClick={() => setConfirming(s.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
