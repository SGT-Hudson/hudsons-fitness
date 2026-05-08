import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IngredientList } from '@/features/ingredients/components/IngredientList';
import { IngredientDialog } from '@/features/ingredients/components/IngredientDialog';
import { useLocalIngredientSearch } from '@/features/ingredients/hooks';
import type { Ingredient } from '@/features/ingredients/api';

export function IngredientesPage() {
  const { t } = useTranslation('ingredientes');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);

  const search = useLocalIngredientSearch(query, 50);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(ing: Ingredient) {
    setEditing(ing);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('newIngredient')}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <IngredientList
        ingredients={search.data ?? []}
        loading={search.isLoading}
        onEdit={openEdit}
      />

      <IngredientDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        mode={editing ? 'edit' : 'create'}
        initial={editing}
      />
    </div>
  );
}
