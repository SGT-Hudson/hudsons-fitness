import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';

/**
 * The "ampliar" affordance the canvas draws at the top-right of each Progreso
 * chart card (`progreso-explora-mobile.jsx`, the 24px bordered square). It only
 * opens the sheet — the chart it expands is the SAME component, re-rendered
 * taller; neither chart is forked into a big/small pair.
 */
export function ExpandChartButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('metricas');
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-[26px] shrink-0 rounded-[7px] text-text-dim"
      aria-label={t('charts.expand')}
      onClick={onClick}
    >
      <Maximize2 className="size-3" aria-hidden="true" />
    </Button>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sheet heading, e.g. "Peso · evolución". Doubles as the accessible name. */
  title: string;
  /** The dim tabular line under it, e.g. "Media móvil 5 días · 6M". */
  subtitle: string;
  children: ReactNode;
}

/**
 * The expanded-chart sheet: the canvas's `GraficaPesoSheet` /
 * `GraficaComposicionSheet` chrome (title + subtitle + close) on the shared
 * `ResponsiveDialog` `panel` shell — vaul drawer on mobile, docked dialog on
 * desktop. The close button is mobile-only because vaul's DrawerContent draws
 * none while radix's DialogContent draws its own X.
 */
export function ChartSheet({ open, onOpenChange, title, subtitle, children }: Props) {
  const { t } = useTranslation('metricas');
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={title} variant="panel">
      {({ isMobile }) => (
        <>
          <div className="flex shrink-0 items-start gap-2.5 px-4.5 pb-3 pt-1">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-title-sheet">{title}</h2>
              <span className="tnum block truncate text-[11.5px] text-text-dim">{subtitle}</span>
            </div>
            {isMobile && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-[30px] shrink-0 rounded-[9px] text-text-dim"
                aria-label={t('charts.close')}
                onClick={() => onOpenChange(false)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4.5 pb-4">{children}</div>
        </>
      )}
    </ResponsiveDialog>
  );
}
