import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { CopyMealPanel, type CopyMode, type CopyTarget } from './CopyMealPanel';

export type { CopyMode, CopyTarget };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLabel: string;
  entryNames: string[];
  targets: CopyTarget[];
  busy?: boolean;
  onConfirm: (selectedKeys: string[], mode: CopyMode) => void | Promise<void>;
  /** Forwarded to `CopyMealPanel` — see its doc comment. Defaults to `false`. */
  allowAppend?: boolean;
}

/**
 * The copy-meal shell: `ResponsiveDialog` (drawer on mobile, centered dialog
 * on desktop) around `CopyMealPanel`. Owns the two bits of transient state the
 * panel itself is deliberately stateless about — `mode` and `selected` — and
 * resets both on every (re)open, exactly like the flat checkbox list this
 * replaces used to reset its selection.
 */
export function CopyMealDialog({
  open,
  onOpenChange,
  sourceLabel,
  entryNames,
  targets,
  busy,
  onConfirm,
  allowAppend,
}: Props) {
  const { t } = useTranslation('planning');
  const [mode, setMode] = useState<CopyMode>('replace');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setMode('replace');
      setSelected(new Set());
    }
  }, [open]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function confirm(keys: string[], m: CopyMode) {
    await onConfirm(keys, m);
    onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('copyMeal.title')}
      variant="centered"
    >
      <div className="space-y-4">
        <h2 className="text-base font-semibold">{t('copyMeal.title')}</h2>
        <CopyMealPanel
          sourceLabel={sourceLabel}
          entryNames={entryNames}
          targets={targets}
          mode={mode}
          onModeChange={setMode}
          selected={selected}
          onToggle={toggle}
          busy={busy}
          onConfirm={confirm}
          allowAppend={allowAppend}
        />
      </div>
    </ResponsiveDialog>
  );
}
