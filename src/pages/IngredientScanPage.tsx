import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, Keyboard, Loader2, PackageSearch, Search, X, Zap, ZapOff } from 'lucide-react';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useBarcodeLookup } from '@/features/ingredients/hooks';
import { useBarcodeCamera } from '@/features/ingredients/useBarcodeCamera';
import {
  INGREDIENT_NEW_MANUAL,
  INGREDIENTS_LIST,
  type IngredientEditorRouteState,
} from '@/features/ingredients/editorRoute';
import { isValidEan, type OFFProductLookup } from '@/lib/openfoodfacts';

/**
 * What the page knows about the code in front of it. `null` = nothing yet, the
 * camera is hunting.
 */
type Lookup =
  | { kind: 'looking'; code: string; source: 'camera' | 'manual' }
  /** OFF knew it. The product — not just the code — is what travels on. */
  | { kind: 'found'; code: string; product: OFFProductLookup }
  /** OFF did not. The code travels alone and the row stays manual. */
  | { kind: 'notFound'; code: string }
  | null;

/**
 * `/recipes/ingredients/scan` — the full-screen viewfinder (canvas
 * `IngredienteEscanearMobile`).
 *
 * **The route shape is `IngredientSearchPage`'s** and for its reasons: a normal
 * route inside `AppLayout` that renders a Radix takeover (`Dialog open` +
 * `DialogPrimitive.Content`, `fixed inset-0 z-30` — above the bottom nav's
 * `z-20` — with an `sr-only` title). Radix gives the focus trap and the Escape
 * key for free; `open` is always `true` because the component only mounts while
 * the route is active, so "closing" is always a navigation.
 *
 * **The engine is not this file's.** `useBarcodeCamera` is the same native
 * `BarcodeDetector` + lazy ZXing fallback + EAN re-validation + track teardown
 * that shipped in R-21; this page is chrome and a state machine around it. Only
 * a real device can exercise the camera — jsdom has none.
 *
 * **The four states**, all of them living in the canvas's status-pill slot:
 *
 *  - **scanning** — the live viewfinder, the corner-bracket window (whose
 *    `0 0 0 9999px` shadow IS the scrim), the laser, the torch.
 *  - **found** — OFF knew the code ⇒ straight to the editor carrying the **whole
 *    `OFFSearchResult`**, which is what makes the save an import
 *    (`source='openfoodfacts'` + `external_id`) instead of an anonymous manual
 *    row. The editor, prefilled, is the confirmation — an extra "continuar" tap
 *    here would confirm nothing the next screen does not show.
 *  - **not-found** — OFF did not know it. A decision, not a teleport: mis-scans
 *    (an inner code, a shipping label) are common and re-scanning is the usual
 *    repair, so the panel offers both — "crearlo a mano" routes to the editor
 *    **pre-filled with the scanned EAN** (spec §6), "escanear otro" reopens the
 *    camera.
 *  - **permission-denied** — split out of the old single `cameraError`, because a
 *    refused camera is *fixable*: the copy says how to unblock it, and it can be
 *    retried. A camera that fails for any other reason (no camera, in use,
 *    insecure origin) gets the generic copy instead — there is nothing to unblock.
 *
 * **The typed-code hatch is reachable from all four**, and that is load-bearing:
 * the method picker deliberately ships no typed-EAN field on touch precisely
 * because this exists. Without it, a phone that denies the camera could not
 * enter a barcode at all.
 *
 * The chrome is deliberately dark in BOTH themes (`bg-black`, `text-white`,
 * white-alpha glass) — it sits over a camera feed, not over the app surface, so
 * it uses literal colours rather than the light/dark tokens.
 */
export function IngredientScanPage() {
  const { t } = useTranslation('ingredientes');
  const { t: tCommon } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();

  const lookup = useBarcodeLookup();
  const [result, setResult] = useState<Lookup>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualEan, setManualEan] = useState('');

  const camera = useBarcodeCamera((code) => void resolve(code, 'camera'));

  const exitTo = `${INGREDIENTS_LIST}${location.search}`;

  async function resolve(code: string, source: 'camera' | 'manual') {
    setResult({ kind: 'looking', code, source });
    try {
      const product = await lookup.mutateAsync(code);
      // The answer replaces the typed-code panel — it asked its question.
      setManualOpen(false);
      setManualEan('');
      setResult(product ? { kind: 'found', code, product } : { kind: 'notFound', code });
    } catch {
      // Transport / 5xx — `useBarcodeLookup` already toasted it. Nothing was
      // learned about the code, so drop back to where the user was: the camera
      // (which the engine stopped on the hit) has to be reopened to be usable.
      setResult(null);
      if (source === 'camera') camera.restart();
    }
  }

  // Found exits by navigation. In an effect rather than inside `resolve` so the
  // success state renders once before it leaves — and so the route change is not
  // dispatched from inside a promise chain mid-render.
  useEffect(() => {
    if (result?.kind !== 'found') return;
    navigate(`${INGREDIENT_NEW_MANUAL}${location.search}`, {
      state: { offProduct: result.product } satisfies IngredientEditorRouteState,
    });
  }, [result, navigate, location.search]);

  function createManually(code: string) {
    navigate(`${INGREDIENT_NEW_MANUAL}${location.search}`, {
      state: { ean: code } satisfies IngredientEditorRouteState,
    });
  }

  function scanAgain() {
    setResult(null);
    setManualOpen(false);
    setManualEan('');
    camera.restart();
  }

  const denied = camera.status === 'denied';
  const broken = camera.status === 'error';
  const cameraDown = denied || broken;
  // What is in front of the user: at most one panel over the viewfinder.
  const panel = manualOpen
    ? 'manual'
    : result?.kind === 'notFound'
      ? 'notFound'
      : cameraDown
        ? 'camera'
        : null;

  const pill = (() => {
    if (result?.kind === 'looking') {
      return { tone: 'busy' as const, label: t('scan.looking') };
    }
    if (result?.kind === 'found') {
      return { tone: 'ok' as const, label: t('scan.found') };
    }
    if (camera.status === 'starting') {
      return { tone: 'busy' as const, label: t('scan.starting') };
    }
    return { tone: 'live' as const, label: t('scan.searching') };
  })();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) navigate(exitTo);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-black text-white outline-none"
        >
          <DialogTitle className="sr-only">{t('scan.title')}</DialogTitle>

          {/* The feed. `aria-hidden`: there is nothing in it for a screen reader,
              and the status pill below narrates the state instead. */}
          <video
            ref={camera.videoRef}
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
          />

          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),0.75rem)]">
              <GlassButton label={t('scan.close')} onClick={() => navigate(exitTo)}>
                <X className="size-[17px]" aria-hidden="true" />
              </GlassButton>
              <div className="min-w-0 flex-1 text-center">
                <p className="text-[15px] font-semibold">{t('scan.title')}</p>
                <p className="mt-px text-[10.5px] text-white/65">{t('scan.subtitle')}</p>
              </div>
              {camera.torchAvailable ? (
                <GlassButton
                  label={camera.torchOn ? t('scan.torchOff') : t('scan.torchOn')}
                  pressed={camera.torchOn}
                  onClick={camera.toggleTorch}
                >
                  {camera.torchOn ? (
                    <Zap className="size-4 fill-current" aria-hidden="true" />
                  ) : (
                    <ZapOff className="size-4" aria-hidden="true" />
                  )}
                </GlassButton>
              ) : (
                // Keeps the title optically centred when there is no torch.
                <span className="size-[38px] shrink-0" aria-hidden="true" />
              )}
            </header>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4">
              {/* The framing window. Its `0 0 0 9999px` shadow IS the scrim (the
                  canvas's trick): one element, no overlay to keep in sync, and
                  the window itself stays perfectly clear. */}
              <div className="relative h-[196px] w-full max-w-[302px] rounded-[24px] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                <span className="absolute -left-0.5 -top-0.5 size-8 rounded-tl-[24px] border-l-[3.5px] border-t-[3.5px] border-white" />
                <span className="absolute -right-0.5 -top-0.5 size-8 rounded-tr-[24px] border-r-[3.5px] border-t-[3.5px] border-white" />
                <span className="absolute -bottom-0.5 -left-0.5 size-8 rounded-bl-[24px] border-b-[3.5px] border-l-[3.5px] border-white" />
                <span className="absolute -bottom-0.5 -right-0.5 size-8 rounded-br-[24px] border-b-[3.5px] border-r-[3.5px] border-white" />
                {/* The laser only sweeps while the camera is actually hunting —
                    a moving laser over a frozen/never-started feed is a lie. */}
                {!cameraDown && result === null && (
                  <span className="absolute inset-x-4 top-1/2 h-[2.5px] rounded-sm bg-accent shadow-[0_0_14px_2px_var(--accent)] motion-safe:animate-scan-laser" />
                )}
              </div>

              <div className="flex flex-col items-center gap-2.5 text-center">
                <StatusPill tone={pill.tone} label={pill.label} />
                <p className="text-[11.5px] text-white/65">{t('scan.aim')}</p>
              </div>
            </div>

            {/* The escape hatch, pinned. Not rendered under an open panel: the
                panel either IS the hatch or offers it, and a second copy of the
                button underneath is one a screen reader would still find. */}
            <footer className="flex shrink-0 justify-center px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2">
              {!panel && (
                <button
                  type="button"
                  onClick={() => setManualOpen(true)}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-[18px] text-[13px] font-medium text-white backdrop-blur-sm"
                >
                  <Keyboard className="size-[15px]" aria-hidden="true" />
                  {t('scan.manualOpen')}
                </button>
              )}
            </footer>
          </div>

          {panel && (
            <div className="absolute inset-0 z-20 flex items-end bg-black/70 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur-[2px]">
              <div className="mx-auto w-full max-w-content rounded-[18px] border border-white/15 bg-neutral-900 p-4 text-white">
                {panel === 'manual' ? (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (isValidEan(manualEan) && !lookup.isPending) {
                        void resolve(manualEan, 'manual');
                      }
                    }}
                  >
                    <div className="space-y-1.5">
                      <label htmlFor="scan-manual-ean" className="text-[12.5px] font-semibold">
                        {t('barcode.manualLabel')}
                      </label>
                      <input
                        id="scan-manual-ean"
                        autoFocus
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="8410054720533"
                        value={manualEan}
                        onChange={(e) => setManualEan(e.target.value.replace(/\D/g, ''))}
                        className="h-11 w-full rounded-[10px] border border-white/20 bg-white/10 px-3 font-mono text-[14px] tracking-[0.04em] text-white outline-none placeholder:text-white/35 focus:border-accent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setManualOpen(false)}
                        className="h-11 flex-1 rounded-[10px] border border-white/20 text-[13.5px] font-medium"
                      >
                        {tCommon('cancel')}
                      </button>
                      <Button
                        type="submit"
                        disabled={!isValidEan(manualEan) || lookup.isPending}
                        className="h-11 flex-1"
                      >
                        {lookup.isPending ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Search className="size-4" aria-hidden="true" />
                        )}
                        {lookup.isPending ? t('barcode.looking') : t('barcode.lookup')}
                      </Button>
                    </div>
                  </form>
                ) : panel === 'notFound' && result?.kind === 'notFound' ? (
                  <div className="space-y-3">
                    <PanelHead
                      icon={<PackageSearch className="size-[18px]" aria-hidden="true" />}
                      title={t('scan.notFoundTitle')}
                      hint={t('scan.notFoundHint', { code: result.code })}
                    />
                    <div className="space-y-2">
                      <Button
                        type="button"
                        className="h-11 w-full"
                        onClick={() => createManually(result.code)}
                      >
                        {t('scan.notFoundCreate')}
                      </Button>
                      <button
                        type="button"
                        onClick={scanAgain}
                        className="h-11 w-full rounded-[10px] border border-white/20 text-[13.5px] font-medium"
                      >
                        {t('scan.again')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <PanelHead
                      icon={<ZapOff className="size-[18px]" aria-hidden="true" />}
                      title={denied ? t('scan.deniedTitle') : t('scan.errorTitle')}
                      hint={denied ? t('scan.deniedHint') : t('scan.errorHint')}
                    />
                    <div className="space-y-2">
                      <Button
                        type="button"
                        className="h-11 w-full"
                        onClick={() => setManualOpen(true)}
                      >
                        <Keyboard className="size-4" aria-hidden="true" />
                        {t('scan.manualOpen')}
                      </Button>
                      {denied && (
                        <button
                          type="button"
                          onClick={camera.restart}
                          className="h-11 w-full rounded-[10px] border border-white/20 text-[13.5px] font-medium"
                        >
                          {t('scan.deniedRetry')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

function GlassButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="grid size-[38px] shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm"
    >
      {children}
    </button>
  );
}

/**
 * The canvas's status pill — the slot every state speaks through, and the only
 * narration of the viewfinder there is (the feed itself is `aria-hidden`), so it
 * is a live region: "buscando código…" → "buscando el producto…" → "producto
 * encontrado" has to reach a screen reader too.
 */
function StatusPill({ tone, label }: { tone: 'live' | 'busy' | 'ok'; label: string }) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3.5 py-[7px] backdrop-blur-sm"
    >
      {tone === 'busy' ? (
        <Loader2 className="size-3 animate-spin text-white" aria-hidden="true" />
      ) : tone === 'ok' ? (
        <Check className="size-3 text-accent" aria-hidden="true" />
      ) : (
        <span className="size-[7px] rounded-full bg-accent" aria-hidden="true" />
      )}
      <span className="text-[12px] font-medium text-white">{label}</span>
    </span>
  );
}

function PanelHead({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/10">
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="text-[12px] leading-[1.45] text-white/70">{hint}</p>
      </div>
    </div>
  );
}
