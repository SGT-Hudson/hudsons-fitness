import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/** ⓘ trigger → reps-in-reserve anchor table. Reused on the routine builder's
 *  target_rpe field and the runner's RPE input (spec §5.1). */
export function RpeExplainer() {
  const { t } = useTranslation('entrenamiento');
  const anchors = [10, 9, 8, 7, 6] as const;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('rpe.explainLabel')}
          className="inline-flex items-center text-muted-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="w-64 max-w-[calc(100vw-2rem)] text-sm">
        <DialogHeader>
          <DialogTitle>{t('rpe.title')}</DialogTitle>
          <DialogDescription>{t('rpe.subtitle')}</DialogDescription>
        </DialogHeader>
        <ul className="mt-2 space-y-1">
          {anchors.map((v) => (
            <li key={v} className="flex justify-between">
              <span className="font-mono">{v}</span>
              <span className="text-muted-foreground">{t(`rpe.anchor.${v}`)}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
