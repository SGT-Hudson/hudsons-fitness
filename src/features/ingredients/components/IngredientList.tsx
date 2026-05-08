import { useTranslation } from 'react-i18next';
import { Database, Globe, Pencil, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeleteIngredient } from '../hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Ingredient } from '../api';

interface Props {
  ingredients: Ingredient[];
  loading: boolean;
  onEdit: (ing: Ingredient) => void;
}

function SourceBadge({ source }: { source: string }) {
  const { t } = useTranslation('ingredientes');
  if (source === 'system') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title={t('source.system')}
      >
        <Database className="h-3 w-3" />
        {t('source.systemShort')}
      </span>
    );
  }
  if (source === 'openfoodfacts') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title={t('source.openfoodfacts')}
      >
        <Globe className="h-3 w-3" />
        OFF
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={t('source.manual')}
    >
      <User className="h-3 w-3" />
      {t('source.manualShort')}
    </span>
  );
}

export function IngredientList({ ingredients, loading, onEdit }: Props) {
  const { t } = useTranslation('ingredientes');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const del = useDeleteIngredient();

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{tCommon('loading')}</p>;
  }
  if (ingredients.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{t('list.empty')}</p>;
  }

  return (
    <ul className="divide-y rounded-md border">
      {ingredients.map((ing) => {
        const owned = ing.created_by_user_id === user?.id;
        const unit = ing.unit_type === 'unit' ? t('list.perUnit') : t('list.per100g');
        return (
          <li key={ing.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{ing.name}</span>
                {ing.brand && (
                  <span className="text-sm text-muted-foreground truncate">· {ing.brand}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums mt-0.5">
                <span>
                  {ing.kcal_per_unit} kcal {unit}
                </span>
                <span>P {ing.protein_g_per_unit}</span>
                <span>C {ing.carbs_g_per_unit}</span>
                <span>F {ing.fat_g_per_unit}</span>
                <SourceBadge source={ing.source} />
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {owned ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={tCommon('edit')}
                    onClick={() => onEdit(ing)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={tCommon('delete')}
                    disabled={del.isPending}
                    onClick={() => {
                      if (window.confirm(t('list.deleteConfirm'))) {
                        del.mutate(ing.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground px-2">{t('list.readOnly')}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
