import { useTranslation } from 'react-i18next';
import { Database, Globe, Pencil, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHideIngredient } from '../hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { ingredientDisplayName, type Ingredient } from '../api';

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
  const { t, i18n } = useTranslation('ingredientes');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const hide = useHideIngredient();

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
                <span className="font-medium truncate">{ingredientDisplayName(ing, lang)}</span>
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
              {/* Edit affordance is owner-only (only the creator can edit
                  pool data). Hide/remove drops your reference row for any
                  row in *my library* — owner or not — and leaves the pooled
                  item and its ownership untouched (R-25; the creator keeps
                  ownership and can re-add it later). */}
              {owned && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tCommon('edit')}
                  onClick={() => onEdit(ing)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('list.removeFromLibrary')}
                disabled={hide.isPending}
                onClick={() => {
                  if (window.confirm(t('list.removeConfirm'))) {
                    hide.mutate(ing.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
