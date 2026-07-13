import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidEan } from '@/lib/openfoodfacts';
import type { IScannerControls } from '@zxing/browser';

/**
 * `starting` → `scanning`, or one of the two ways it can fail:
 *
 *  - **`denied`** — the user (or a policy) refused the camera. A *fixable* state:
 *    it has its own copy and its own way out (unblock and retry, or type the code).
 *  - **`error`** — anything else: no camera on the device, the camera is held by
 *    another app, an insecure origin. Nothing the user can unblock.
 *
 * Splitting them is the whole reason this is not one `cameraError` any more.
 */
export type BarcodeCameraStatus = 'starting' | 'scanning' | 'denied' | 'error';

export interface BarcodeCamera {
  /** Attach to the `<video>` the caller renders — the pipeline reads from it. */
  videoRef: React.RefObject<HTMLVideoElement>;
  status: BarcodeCameraStatus;
  /** The device has a torch AND lets us drive it (rear camera, Chrome/Android). */
  torchAvailable: boolean;
  torchOn: boolean;
  toggleTorch: () => void;
  /** Tear the camera down and open it again — "escanear otro", or a retry after
   *  the user unblocked the permission. */
  restart: () => void;
}

// Minimal structural type for the native BarcodeDetector (no DOM lib types
// for it yet in our TS target). We only use what we need.
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
interface BarcodeDetectorCtor {
  new (opts: { formats: string[] }): NativeBarcodeDetector;
}

// Torch is not in the TS DOM lib (it is in the Image Capture spec, and browsers
// expose it on the video track's capabilities/constraints).
interface TorchCapability {
  torch?: boolean;
}
interface TorchConstraint {
  torch: boolean;
}

// UPC-E intentionally excluded: isValidEan implements EAN-8/13 + UPC-A
// checksums, not the UPC-E compression scheme, so a UPC-E decode would be
// dropped downstream anyway. Restrict the detector to what we can validate.
const EAN_FORMATS = ['ean_13', 'ean_8', 'upc_a'];

/**
 * The scanner ENGINE, unchanged and lifted out of `BarcodeScanner` so that two
 * very different chromes can mount it: the full-screen viewfinder
 * (`IngredientScanPage`) and the dialog's inline box. Native `BarcodeDetector`
 * when the browser has one, a lazily-imported `@zxing/browser` reader when it
 * does not (iOS Safari), `isValidEan` re-validation on **every** decode (a
 * partial-frame misread must never leave this hook), and a teardown that cancels
 * the rAF loop, stops the zxing controls and stops every track — on a hit, on a
 * restart, and on unmount alike. A leaked track leaves the phone's camera light
 * on after the user has navigated away.
 *
 * `onDetected` is read through a ref: the caller re-renders on every state
 * change and hands us a fresh closure each time, and depending on its identity
 * would tear the camera down and reopen it mid-scan.
 */
export function useBarcodeCamera(onDetected: (code: string) => void): BarcodeCamera {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState<BarcodeCameraStatus>('starting');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  // Bumped by `restart()` — the effect's only dependency, so a bump runs the
  // teardown and opens the camera again.
  const [attempt, setAttempt] = useState(0);

  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    stoppedRef.current = false;
    let zxingControls: IScannerControls | null = null;
    let rafId = 0;

    function fire(code: string) {
      if (stoppedRef.current) return;
      if (!isValidEan(code)) return; // reject partial-frame misreads
      stoppedRef.current = true;
      stopCamera();
      onDetectedRef.current(code);
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

        const [track] = stream.getVideoTracks();
        const caps = (track?.getCapabilities?.() ?? {}) as TorchCapability;
        setTorchAvailable(Boolean(caps.torch));

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
      } catch (err) {
        if (stoppedRef.current) return;
        // A refusal is a user state with a way out; everything else is a device
        // failure with none. `SecurityError` is how older Safari says "denied".
        const name = (err as DOMException | null)?.name;
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      }
    }

    void start();
    return () => {
      stoppedRef.current = true;
      stopCamera();
    };
  }, [attempt]);

  const toggleTorch = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    // The torch rides on the live track: stopping the track (teardown) always
    // turns it off, so there is nothing to unwind here.
    void track
      .applyConstraints({ advanced: [{ torch: next } as TorchConstraint] } as MediaTrackConstraints)
      .then(() => setTorchOn(next))
      // The capability lied (some Android cameras advertise a torch they cannot
      // drive). Drop the affordance rather than leave a button that does nothing.
      .catch(() => setTorchAvailable(false));
  }, [torchOn]);

  const restart = useCallback(() => {
    setStatus('starting');
    setTorchAvailable(false);
    setTorchOn(false);
    setAttempt((n) => n + 1);
  }, []);

  return { videoRef, status, torchAvailable, torchOn, toggleTorch, restart };
}
