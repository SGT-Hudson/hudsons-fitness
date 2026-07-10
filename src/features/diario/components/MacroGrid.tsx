import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { PhaseType } from '@/core/nutritionTone';
import { MacroTile, type MacroTileMetric } from './MacroTile';

export interface MacroGridItem {
  metric: MacroTileMetric;
  consumed: number;
  target?: number;
  unit: string;
  floorG?: number;
  phase?: PhaseType;
}

interface Props {
  items: MacroGridItem[];
  /** Mobile Diario: closed by default behind a "Macros" toggle. The web
   * right rail omits this prop — always-open static 2×2. */
  collapsible?: boolean;
}

/** 2×2 grid of `MacroTile`s, optionally behind a progressive-disclosure toggle. */
export function MacroGrid({ items, collapsible }: Props) {
  const { t } = useTranslation('diario');
  const [open, setOpen] = useState(false);

  const grid = (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((item) => (
        <MacroTile key={item.metric} {...item} />
      ))}
    </div>
  );

  if (!collapsible) return grid;

  return (
    <div>
      {open && <div className="mb-2.5">{grid}</div>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1.5 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {t('totals.macrosToggle')}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  );
}
