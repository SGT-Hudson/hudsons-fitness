import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CopyMode = 'replace' | 'append';

/** A copy destination: a day cell in the grid. */
export interface CopyTarget {
  key: string;
  label: string;
  sublabel?: string;
  willOverwrite: boolean;
}

interface Props {
  sourceLabel: string;
  /** The source meal's recipe names, recapped so the user knows what travels. */
  entryNames: string[];
  targets: CopyTarget[];
  mode: CopyMode;
  onModeChange: (mode: CopyMode) => void;
  selected: Set<string>;
  onToggle: (key: string) => void;
  /** Select every day at once, or clear them all when every day is already on. */
  onToggleAll: () => void;
  busy?: boolean;
  onConfirm: (selectedKeys: string[], mode: CopyMode) => void | Promise<void>;
  /**
   * Whether the replace/append mode toggle is offered at all. Defaults to
   * `false`: a caller with no append data path (e.g. the template editor)
   * must not show a control that silently replaces when the user picks
   * "append" — a lying toggle is worse than no toggle. When falsy, the mode
   * is forced to `'replace'` regardless of the `mode` prop.
   */
  allowAppend?: boolean;
}

const MODES: { mode: CopyMode; key: string }[] = [
  { mode: 'replace', key: 'copyMeal.modeReplace' },
  { mode: 'append', key: 'copyMeal.modeAppend' },
];

/**
 * The copy-meal canvas: source recap, replace/append segmented control, the
 * 7-cell day grid, a mode-aware summary line and the CTA. Pure — the dialog
 * shell (`CopyMealDialog`) owns `mode` and `selected`, so this same surface
 * can be reused standalone.
 *
 * The `willOverwrite` badge only ever renders in `replace` mode: append never
 * deletes anything, so warning about an overwrite there would be a lie.
 */
export function CopyMealPanel({
  sourceLabel,
  entryNames,
  targets,
  mode,
  onModeChange,
  selected,
  onToggle,
  onToggleAll,
  busy,
  onConfirm,
  allowAppend = false,
}: Props) {
  const { t } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const effectiveMode: CopyMode = allowAppend ? mode : 'replace';
  const allSelected = targets.length > 0 && selected.size === targets.length;
  const someSelected = selected.size > 0 && !allSelected;

  function confirm() {
    // Preserve target order in the emitted keys.
    void onConfirm(
      targets.filter((tg) => selected.has(tg.key)).map((tg) => tg.key),
      effectiveMode,
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{sourceLabel}</p>
        {entryNames.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
            <span>{t('copyMeal.sourceRecipes')}</span>
            <ul className="flex flex-wrap items-center gap-x-1.5">
              {/* Keyed by index, not name: append makes "the same recipe twice in
                  one meal" legal, and names would then collide. */}
              {entryNames.map((name, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">·</span>}
                  <span>{name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {allowAppend && (
        <div
          role="group"
          aria-label={t('copyMeal.title')}
          className="flex gap-1 rounded-lg border border-border bg-muted p-1"
        >
          {MODES.map(({ mode: m, key }) => (
            <button
              key={m}
              type="button"
              aria-pressed={effectiveMode === m}
              onClick={() => onModeChange(m)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                effectiveMode === m
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(key)}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            role="checkbox"
            aria-checked={allSelected ? 'true' : someSelected ? 'mixed' : 'false'}
            aria-label={t('copyMeal.selectAll')}
            onClick={onToggleAll}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              allSelected || someSelected
                ? 'border-accent-line bg-accent-soft text-accent-ink'
                : 'border-border bg-card text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border',
                allSelected || someSelected
                  ? 'border-accent-line bg-card'
                  : 'border-muted-foreground/50',
              )}
            >
              {allSelected && <Check className="h-2.5 w-2.5 text-accent-ink" aria-hidden="true" />}
              {someSelected && (
                <span className="h-0.5 w-1.5 rounded-full bg-accent-ink" aria-hidden="true" />
              )}
            </span>
            {t('copyMeal.selectAll')}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {targets.map((tg) => {
            const on = selected.has(tg.key);
            const showBadge = effectiveMode === 'replace' && tg.willOverwrite;
            return (
              <button
                key={tg.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={tg.sublabel ? `${tg.label} ${tg.sublabel}` : tg.label}
                onClick={() => onToggle(tg.key)}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-xs',
                  on ? 'border-accent-line bg-accent-soft' : 'border-border bg-card',
                )}
              >
                {on && (
                  <Check
                    className="absolute right-1 top-1 h-3 w-3 text-accent-ink"
                    aria-hidden="true"
                  />
                )}
                <span className="font-medium">{tg.label}</span>
                {tg.sublabel && (
                  <span className="tnum text-[10px] text-muted-foreground">{tg.sublabel}</span>
                )}
                {showBadge && (
                  <span className="rounded-full border border-transparent bg-amber-soft px-1.5 py-0.5 text-[10px] text-amber-ink">
                    {t('copyMeal.willOverwrite')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="tnum text-xs text-muted-foreground">
        {selected.size === 0
          ? t('copyMeal.pickDays')
          : t(effectiveMode === 'replace' ? 'copyMeal.summaryReplace' : 'copyMeal.summaryAppend', {
              count: selected.size,
            })}
      </p>

      <Button type="button" className="w-full" disabled={busy || selected.size === 0} onClick={confirm}>
        {busy ? tCommon('loading') : t('copyMeal.confirm')}
      </Button>
    </div>
  );
}
