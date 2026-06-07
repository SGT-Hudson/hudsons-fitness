import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { MuscleSelect } from './MuscleSelect';
import { CATEGORY_VALUES, LEVEL_VALUES, EQUIPMENT_VALUES, categorySlug } from '../exercises/api';
import { type BrowseFilters, EMPTY_FILTERS, activeFilterCount } from './AppliedFilterChips';

const SELECT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export function ExerciseFilters({
  filters, onChange,
}: { filters: BrowseFilters; onChange: (next: BrowseFilters) => void }) {
  const { t } = useTranslation('entrenamiento');
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);

  return (
    <>
      {/* Plain button controls `open` (no DrawerTrigger) — see the test note. */}
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" />
        {t('browse.filters')}
        {count > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span>
        )}
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t('browse.filtersTitle')}</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('browse.labels.category')}</span>
            <select
              aria-label={t('browse.labels.category')} role="combobox"
              className={SELECT_CLASS}
              value={filters.category ?? ''}
              onChange={(e) => onChange({ ...filters, category: e.target.value || null })}
            >
              <option value="">{t('browse.labels.all')}</option>
              {CATEGORY_VALUES.map((c) => (
                <option key={c} value={c}>{t(`exerciseDialog.category.${categorySlug(c)}`)}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('browse.labels.equipment')}</span>
            <select
              aria-label={t('browse.labels.equipment')} role="combobox"
              className={SELECT_CLASS}
              value={filters.equipment ?? ''}
              onChange={(e) => onChange({ ...filters, equipment: e.target.value || null })}
            >
              <option value="">{t('browse.labels.all')}</option>
              {EQUIPMENT_VALUES.map((eq) => (
                <option key={eq} value={eq}>{t(`exerciseDialog.equipment.${eq}`)}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('browse.labels.level')}</span>
            <select
              aria-label={t('browse.labels.level')} role="combobox"
              className={SELECT_CLASS}
              value={filters.level ?? ''}
              onChange={(e) => onChange({ ...filters, level: e.target.value || null })}
            >
              <option value="">{t('browse.labels.all')}</option>
              {LEVEL_VALUES.map((l) => (
                <option key={l} value={l}>{t(`exerciseDialog.level.${l}`)}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('browse.labels.muscle')}</span>
            <MuscleSelect
              value={filters.muscleValue}
              onChange={(v) => onChange({ ...filters, muscleValue: v })}
              ariaLabel={t('browse.labels.muscle')}
            />
          </label>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>{t('browse.clearAll')}</Button>
            <Button onClick={() => setOpen(false)}>{t('browse.apply')}</Button>
          </div>
        </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
