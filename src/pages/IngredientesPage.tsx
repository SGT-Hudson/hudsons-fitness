import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { RecipesTabs } from './RecipesTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IngredientList } from '@/features/ingredients/components/IngredientList';
import { IngredientDialog } from '@/features/ingredients/components/IngredientDialog';
import { useLocalIngredientSearchPage } from '@/features/ingredients/hooks';
import { usePagination } from '@/hooks/usePagination';
import { PaginationBar } from '@/components/ui/PaginationBar';
import type { Ingredient } from '@/features/ingredients/api';

export function IngredientesPage() {
  const { t } = useTranslation('ingredientes');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);

  const [total, setTotal] = useState(0);
  const { page, pageSize, pageCount, setPage, setPageSize } = usePagination({
    total,
    resetKey: query,
  });
  const search = useLocalIngredientSearchPage(query, page, pageSize);
  useEffect(() => {
    if (search.data) setTotal(search.data.total);
  }, [search.data]);

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
      <RecipesTabs />
      <div className="flex items-center justify-between gap-4 flex-wrap">
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
        ingredients={search.data?.rows ?? []}
        loading={search.isLoading}
        onEdit={openEdit}
      />
      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        pageCount={pageCount}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
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
