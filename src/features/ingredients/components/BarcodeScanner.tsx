import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { isValidEan } from '@/lib/openfoodfacts';
import type { IScannerControls } from '@zxing/browser';

interface Props {
  /** Fired once with a checksum-valid EAN/UPC; the parent stops rendering us. */
  onDetected: (code: string) => void;
}

// Minimal structural type for the native BarcodeDetector (no DOM lib types
// for it yet in our TS target). We only use what we need.
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
interface BarcodeDetectorCtor {
  new (opts: { formats: string[] }): NativeBarcodeDetector;
}

// UPC-E intentionally excluded: isValidEan implements EAN-8/13 + UPC-A
// checksums, not the UPC-E compression scheme, so a UPC-E decode would be
// dropped downstream anyway. Restrict the detector to what we can validate.
const EAN_FORMATS = ['ean_13', 'ean_8', 'upc_a'];

export function BarcodeScanner({ onDetected }: Props) {
  const { t } = useTranslation('ingredientes');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');

  useEffect(() => {
    stoppedRef.current = false;
    let zxingControls: IScannerControls | null = null;
    let rafId = 0;

    function fire(code: string) {
      if (stoppedRef.current) return;
      if (!isValidEan(code)) return; // reject partial-frame misreads
      stoppedRef.current = true;
      stopCamera();
      onDetected(code);
    }

    function stopCamera() {
      if (rafId) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (stoppedRef.current) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true'); // iOS Safari: inline, not fullscreen
        video.muted = true;
        await video.play();
        setStatus('scanning');

        const Detector = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
          .BarcodeDetector;
        if (Detector) {
          const detector = new Detector({ formats: EAN_FORMATS });
          const tick = async () => {
            if (stoppedRef.current || !videoRef.current) return;
            try {
              const found = await detector.detect(videoRef.current);
              if (found[0]?.rawValue) {
                fire(found[0].rawValue);
                return;
              }
            } catch {
              // transient per-frame decode error: keep polling
            }
            rafId = requestAnimationFrame(tick);
          };
          rafId = requestAnimationFrame(tick);
        } else {
          // iOS Safari fallback. Lazy import keeps ZXing out of the main bundle.
          const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatOneDReader();
          zxingControls = await reader.decodeFromVideoElement(videoRef.current!, (result) => {
            if (result) fire(result.getText());
          });
        }
      } catch {
        if (!stoppedRef.current) setStatus('error');
      }
    }

    void start();
    return () => {
      stoppedRef.current = true;
      stopCamera();
    };
  }, [onDetected]);

  if (status === 'error') {
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
