import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useExerciseSearch } from '../exercises/hooks';
import {
  exerciseDisplayName,
  PRIMARY_MUSCLE_VALUES,
  type Exercise,
  type PrimaryMuscle,
} from '../exercises/api';
import { codesInGroup, type MuscleGroup } from '@/core/muscles';
import { MuscleSelect } from './MuscleSelect';
import { musclesMatchingQuery } from '../exercises/muscleSearch';
import { ExerciseDialog } from './ExerciseDialog';
import { ExerciseInfoButton } from './ExerciseInfoButton';
import { cn } from '@/lib/utils';

interface Props {
  selected: Exercise | null;
  onSelect: (exercise: Exercise) => void;
  onClear: () => void;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function ExercisePicker({ selected, onSelect, onClear }: Props) {
  const { t, i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const otherLang: 'es' | 'en' = lang === 'es' ? 'en' : 'es';

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string>(''); // '' | <fineCode> | `group:<group>`
  const debounced = useDebouncedValue(query, 200);
  const containerRef = useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const labelByCode = Object.fromEntries(
    PRIMARY_MUSCLE_VALUES.map((c) => [c, t(`exerciseDialog.muscle.${c}`)]),
  );
  const textMuscles = musclesMatchingQuery(debounced, labelByCode);

  const isGroup = selectedMuscle.startsWith('group:');
  const groupKey = isGroup
    ? (selectedMuscle.slice('group:'.length) as MuscleGroup)
    : null;
  const search = useExerciseSearch(debounced, {
    muscle: isGroup || selectedMuscle === '' ? null : (selectedMuscle as PrimaryMuscle),
    groupMuscles: groupKey ? (codesInGroup(groupKey) as PrimaryMuscle[]) : [],
    textMuscles,
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (selected) {
    const subtitle = otherLang === 'en' ? selected.name_en : selected.name_es;
    return (
      <div className="flex items-center gap-2 w-full rounded-md border border-input bg-background px-3 h-10 text-sm">
        <span className="font-medium truncate flex-1 min-w-0">
          {exerciseDisplayName(selected, lang)}
        </span>
        {subtitle && subtitle !== exerciseDisplayName(selected, lang) && (
          <span className="text-muted-foreground truncate text-xs">{subtitle}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('picker.change')}
          className="h-7 w-7 shrink-0"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const showCreate = query.trim().length > 0;

  return (
    <>
      <div ref={containerRef} className="relative w-full flex flex-col gap-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('picker.placeholder')}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
          />
        </div>
        <MuscleSelect
          value={selectedMuscle}
          onChange={(v) => { setSelectedMuscle(v); setOpen(true); }}
          ariaLabel={t('picker.allMuscles')}
        />
        {open && (
          <div className="absolute z-20 top-full mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
            <ul className="max-h-64 overflow-y-auto py-1">
              {search.isLoading && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  {t('picker.searching')}
                </li>
              )}
              {!search.isLoading && (search.data ?? []).length === 0 && query.trim() !== '' && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  {t('picker.noResults')}
                </li>
              )}
              {(search.data ?? []).map((ex) => {
                const subtitle = otherLang === 'en' ? ex.name_en : ex.name_es;
                const primary = exerciseDisplayName(ex, lang);
                return (
                  <li key={ex.id} className="flex items-center gap-1 pr-1">
                    <button
                      type="button"
                      className={cn(
                        'flex-1 min-w-0 text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                        'flex items-center gap-2 justify-between',
                      )}
                      onClick={() => {
                        onSelect(ex);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="font-medium truncate">{primary}</span>
                        {subtitle && subtitle !== primary && (
                          <span className="text-muted-foreground ml-2 text-xs">{subtitle}</span>
                        )}
                      </span>
                      {ex.equipment && (
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {t(`exerciseDialog.equipment.${ex.equipment}`)}
                        </span>
                      )}
                    </button>
                    <ExerciseInfoButton exercise={ex} />
                  </li>
                );
              })}
            </ul>
            {showCreate && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm font-medium text-primary border-t hover:bg-accent flex items-center gap-2"
                onClick={() => {
                  setCreateOpen(true);
                  setOpen(false);
                }}
              >
                <Plus className="h-4 w-4" />
                {t('picker.createNew', { name: query.trim() })}
              </button>
            )}
          </div>
        )}
      </div>
      <ExerciseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultName={query}
        onCreated={(ex) => {
          onSelect(ex);
          setQuery('');
        }}
      />
    </>
  );
}
