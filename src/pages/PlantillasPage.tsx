import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useDeleteTemplate, useTemplates } from '@/features/templates/hooks';
import { formatDate, type Locale } from '@/lib/dates';

export function PlantillasPage() {
  const { t, i18n } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const navigate = useNavigate();
  const templates = useTemplates();
  const del = useDeleteTemplate();

  function handleDelete(id: string, name: string) {
    if (!window.confirm(t('list.deleteConfirm', { name }))) return;
    del.mutate(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">{t('list.pageTitle')}</h1>
        <Button onClick={() => navigate('/templates/new')}>
          <Plus className="h-4 w-4" />
          {t('list.newTemplate')}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{t('list.description')}</p>

      {templates.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="py-4 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (templates.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('list.empty')}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(templates.data ?? []).map((tpl) => (
            <li key={tpl.id}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/templates/${tpl.id}`}
                      className="font-semibold leading-tight hover:underline"
                    >
                      {tpl.name}
                    </Link>
                    {tpl.is_auto_generated && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 gap-1"
                        title={t('list.autoBadgeTooltip')}
                      >
                        <Sparkles className="h-3 w-3" />
                        {t('list.autoBadge')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      {t('list.slots', { count: tpl.slot_count })} ·{' '}
                      {tpl.default_meal_times.length === 1
                        ? t('list.meals_one', { count: tpl.default_meal_times.length })
                        : t('list.meals_other', { count: tpl.default_meal_times.length })}
                    </div>
                    <div>
                      {t('list.updated', {
                        date: formatDate(tpl.updated_at, 'd MMM yyyy', locale),
                      })}
                    </div>
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon" aria-label={tCommon('edit')}>
                      <Link to={`/templates/${tpl.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={tCommon('delete')}
                      onClick={() => handleDelete(tpl.id, tpl.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
