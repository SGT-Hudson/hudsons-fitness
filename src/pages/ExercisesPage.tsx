import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { PageShell } from '@/components/layout/PageShell';
import { usePagination } from '@/hooks/usePagination';
import { ExerciseCard } from '@/features/training/components/ExerciseCard';
import { ExerciseFilters } from '@/features/training/components/ExerciseFilters';
import { AppliedFilterChips, EMPTY_FILTERS, type BrowseFilters } from '@/features/training/components/AppliedFilterChips';
import { useExercisesBrowse } from '@/features/training/exercises/hooks';
import { PRIMARY_MUSCLE_VALUES, type Equipment, type PrimaryMuscle } from '@/features/training/exercises/api';
import { muscleCodesForQuery } from '@/features/training/exercises/muscleSearch';
import { MUSCLE_GROUPS } from '@/core/muscles';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function ExercisesPage() {
  const { t } = useTranslation('entrenamiento');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY_FILTERS);
  const debounced = useDebouncedValue(query, 200);

  // Typing a muscle name, a group name or a lay term surfaces matches
  // (parity with the picker).
  const labelByCode = useMemo(
    () => Object.fromEntries(PRIMARY_MUSCLE_VALUES.map((c) => [c, t(`exerciseDialog.muscle.${c}`)])),
    [t],
  );
  const groupLabelByKey = useMemo(
    () => Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, t(`exerciseDialog.muscleGroup.${g}`)])),
    [t],
  );
  const textMuscles = muscleCodesForQuery(debounced, labelByCode, groupLabelByKey);

  const resetKey = `${debounced}|${filters.category}|${filters.equipment}|${filters.level}|${filters.muscleValue}`;

  // Hook-order cycle: usePagination must run BEFORE useExercisesBrowse (it produces
  // page/pageSize), so it can't read this render's browse.data.total directly.
  // We hold `total` in state and feed back the resolved count via an effect — this
  // gives usePagination a real total for pageCount/clamping. (placeholderData on the
  // query keeps prior rows visible between page changes, so no flash.)
  const [total, setTotal] = useState(0);
  const { page, pageSize, pageCount, setPage, setPageSize } = usePagination({ total, resetKey });

  const browse = useExercisesBrowse({
    query: debounced,
    category: filters.category,
    equipment: filters.equipment as Equipment | null,
    level: filters.level,
    muscleValue: filters.muscleValue,
    textMuscles: textMuscles as PrimaryMuscle[],
    page,
    pageSize,
  });

  useEffect(() => {
    if (browse.data) setTotal(browse.data.total);
  }, [browse.data]);

  const rows = browse.data?.rows ?? [];

  return (
    <PageShell title={t('browse.title')}>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('browse.subtitle')}</p>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('browse.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ExerciseFilters filters={filters} onChange={setFilters} />
      </div>

      <AppliedFilterChips filters={filters} onChange={setFilters} />

      {browse.isLoading ? (
        <ul data-testid="exercise-skeleton-grid" className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <Card><div className="aspect-4/3 w-full"><Skeleton className="h-full w-full" /></div>
                <CardContent className="space-y-2 py-3">
                  <Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t('browse.empty')}</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((ex) => (<li key={ex.id}><ExerciseCard exercise={ex} /></li>))}
        </ul>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        pageCount={pageCount}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
    </PageShell>
  );
}
