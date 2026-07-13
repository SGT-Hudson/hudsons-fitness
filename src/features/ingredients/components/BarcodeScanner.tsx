import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useBarcodeCamera } from '../useBarcodeCamera';

interface Props {
  /** Fired once with a checksum-valid EAN/UPC; the parent stops rendering us. */
  onDetected: (code: string) => void;
}

/**
 * The inline (dialog-tab) viewfinder — the pre-redesign chrome, on top of the
 * shared engine (`useBarcodeCamera`). The full-screen scanner
 * (`IngredientScanPage`) is the redesigned surface and mounts the same engine;
 * this one lives only as long as `IngredientDialog`'s barcode tab does.
 */
export function BarcodeScanner({ onDetected }: Props) {
  const { t } = useTranslation('ingredientes');
  const { videoRef, status } = useBarcodeCamera(onDetected);

  if (status === 'denied' || status === 'error') {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground space-y-2">
        <p>{t('barcode.cameraError')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md bg-black aspect-4/3">
        <video ref={videoRef} className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-20 border-2 border-white/80 rounded" />
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-center">{t('barcode.aimHint')}</p>
    </div>
  );
}
