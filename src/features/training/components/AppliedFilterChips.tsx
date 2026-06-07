import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { categorySlug } from '../exercises/api';

export interface BrowseFilters {
  category: string | null;
  equipment: string | null;
  level: string | null;
  /** '' | <fineCode> | `group:<group>` */
  muscleValue: string;
}

export const EMPTY_FILTERS: BrowseFilters = {
  category: null, equipment: null, level: null, muscleValue: '',
};

export function isFilterActive(f: BrowseFilters): boolean {
  return f.category !== null || f.equipment !== null || f.level !== null || f.muscleValue !== '';
}

export function activeFilterCount(f: BrowseFilters): number {
  return [f.category, f.equipment, f.level, f.muscleValue || null].filter((v) => v !== null && v !== '').length;
}

export function AppliedFilterChips({
  filters, onChange,
}: { filters: BrowseFilters; onChange: (next: BrowseFilters) => void }) {
  const { t } = useTranslation('entrenamiento');
  if (!isFilterActive(filters)) return null;

  const muscleLabel = (v: string): string =>
    v.startsWith('group:')
      ? t(`exerciseDialog.muscleGroup.${v.slice('group:'.length)}`)
      : t(`exerciseDialog.muscle.${v}`);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.category) chips.push({ key: 'category', label: t(`exerciseDialog.category.${categorySlug(filters.category)}`), clear: () => onChange({ ...filters, category: null }) });
  if (filters.equipment) chips.push({ key: 'equipment', label: t(`exerciseDialog.equipment.${filters.equipment}`), clear: () => onChange({ ...filters, equipment: null }) });
  if (filters.level) chips.push({ key: 'level', label: t(`exerciseDialog.level.${filters.level}`), clear: () => onChange({ ...filters, level: null }) });
  if (filters.muscleValue) chips.push({ key: 'muscle', label: muscleLabel(filters.muscleValue), clear: () => onChange({ ...filters, muscleValue: '' }) });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-foreground hover:bg-primary/20"
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
        {t('browse.clearAll')}
      </Button>
    </div>
  );
}
