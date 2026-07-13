import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Barcode, Camera, CameraOff, ChevronRight, PencilLine, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/layout/PageShell';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useBarcodeLookup, useOFFSearch } from '@/features/ingredients/hooks';
import { OFFSearchPanel } from '@/features/ingredients/components/OFFSearchPanel';
import {
  INGREDIENT_NEW_MANUAL,
  INGREDIENTS_LIST,
  type IngredientEditorRouteState,
} from '@/features/ingredients/editorRoute';
import { isValidEan } from '@/lib/openfoodfacts';

const SCAN = '/recipes/ingredients/scan';

/**
 * `/recipes/ingredients/new` — how do you want to add it? (canvas
 * `IngredienteNuevoMobile` / `IngredienteNuevoWebV2`.)
 *
 * A pure navigation screen: each method ends in `/new/manual` carrying what it
 * learned, in `location.state` (`IngredientEditorRouteState` — the contract).
 * The **whole `OFFSearchResult`** travels on the OFF and barcode paths: that
 * object is what makes the save an import (`source='openfoodfacts'` +
 * `external_id`) rather than an anonymous manual row. A code OFF does not know
 * travels as a bare `ean` instead — there is nothing to import, and the editor
 * says so.
 *
 * **The barcode method is two different things by pointer**, and that is not a
 * layout choice: a webcam is useless against a product barcode, so the camera is
 * gated on `(pointer: coarse)`, as the retired barcode tab already was. Touch gets "abrir
 * cámara" → the scanner route; a desktop pointer gets the typed-EAN field inline
 * and a plain statement that scanning is mobile-only, instead of a button that
 * would open a viewfinder nobody can aim.
 *
 * `?q=` rides through everything (in from the list, out to the editor/scanner),
 * so the search the user was in survives the detour — and on the manual method
 * it also seeds the name.
 */
export function IngredientMethodPage() {
  const { t } = useTranslation('ingredientes');
  const { t: tCommon } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q')?.trim() ?? '';

  const isTouchDevice = useMediaQuery('(pointer: coarse)');
  const [offOpen, setOffOpen] = useState(false);
  const [offQuery, setOffQuery] = useState(query);
  const debouncedOffQuery = useDebouncedValue(offQuery, 350);
  const offSearch = useOFFSearch(debouncedOffQuery, offOpen);
  const [ean, setEan] = useState('');
  const lookup = useBarcodeLookup();

  const exitTo = `${INGREDIENTS_LIST}${location.search}`;

  function toEditor(state: IngredientEditorRouteState) {
    navigate(`${INGREDIENT_NEW_MANUAL}${location.search}`, { state });
  }

  async function lookupEan() {
    const code = ean.trim();
    if (!isValidEan(code)) return;
    try {
      const product = await lookup.mutateAsync(code);
      // Found ⇒ the product itself (an import). Not found ⇒ the code alone: a
      // manual row cannot hold an `external_id` (the
      // `ingredients_external_consistency` CHECK), so claiming an OFF origin
      // here would be a lie the editor would have to unpick.
      if (product) toEditor({ offProduct: product });
      else toEditor({ ean: code });
    } catch {
      // Transport / 5xx — `useBarcodeLookup` already toasted it. Staying put
      // (rather than routing to a blank editor) keeps the field and the code.
    }
  }

  const cancelAction = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => navigate(exitTo)}
      className="hidden md:inline-flex"
    >
      {tCommon('cancel')}
    </Button>
  );

  return (
    <PageShell
      title={t('newIngredient')}
      subtitle={t('method.subtitle')}
      actions={cancelAction}
      back={exitTo}
    >
      {offOpen ? (
        <div className="space-y-3">
          <OFFSearchPanel
            query={offQuery}
            onQueryChange={setOffQuery}
            isLoading={offSearch.isFetching}
            results={offSearch.data ?? []}
            // Nothing to highlight: a pick leaves this screen for the editor,
            // which is where the product gets reviewed and adjusted.
            picked={null}
            onPick={(product) => toEditor({ offProduct: product })}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => setOffOpen(false)}>
            {t('method.offBack')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3.5">
          <p className="text-[12.5px] leading-[1.5] text-muted-foreground md:text-[13.5px]">
            {t('method.intro')}
          </p>

          {/* One DOM, two orders: mobile leads with the scan (a phone HAS a
              usable camera — the artboard makes it the hero), desktop leads with
              manual and closes on the barcode card, whose typed-EAN field makes
              it the tallest of the three. */}
          <div className="flex flex-col gap-3">
            {/* Escanear / código de barras — the accented card on both artboards. */}
            <div className="order-1 rounded-[14px] border-[1.5px] border-accent-line bg-accent-soft p-3.5 text-accent-ink md:order-3 md:p-4">
              <div className="flex items-center gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-card text-accent md:size-12">
                  <Barcode className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14.5px] font-semibold md:text-[16px]">
                    {isTouchDevice ? t('method.scanTitle') : t('method.eanTitle')}
                  </h3>
                  <p className="mt-0.5 text-[11.5px] leading-[1.4] opacity-85 md:text-[12.5px]">
                    {isTouchDevice ? t('method.scanHint') : t('method.eanHint')}
                  </p>
                </div>
              </div>

              {isTouchDevice ? (
                <Link
                  to={`${SCAN}${location.search}`}
                  className="mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-accent text-[14px] font-semibold text-accent-foreground"
                >
                  <Camera className="size-4" aria-hidden="true" />
                  {t('method.scanOpen')}
                </Link>
              ) : (
                <>
                  <div className="mt-4 flex items-end gap-2.5">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="method-ean" className="text-[12px]">
                        {t('barcode.manualLabel')}
                      </Label>
                      <Input
                        id="method-ean"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="8410054720533"
                        className="h-11 bg-card font-mono tracking-[0.04em]"
                        value={ean}
                        onChange={(e) => setEan(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    <Button
                      type="button"
                      className="h-11"
                      disabled={!isValidEan(ean) || lookup.isPending}
                      onClick={() => void lookupEan()}
                    >
                      <Search className="size-4" aria-hidden="true" />
                      {lookup.isPending ? t('barcode.looking') : t('barcode.lookup')}
                    </Button>
                  </div>

                  {/* Not a disabled button — a statement. The camera is gated on
                      `(pointer: coarse)`, so on this device there is nothing to
                      enable, and an inert affordance would only invite clicks. */}
                  <p className="mt-3 flex items-center gap-3 rounded-[10px] border border-dashed bg-card px-3.5 py-2.5 text-[11.5px] leading-[1.4] text-muted-foreground">
                    <CameraOff className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
                    <span>
                      <b className="font-semibold text-foreground">{t('method.cameraTitle')}</b>{' '}
                      {t('method.cameraDesktopOnly')}
                    </span>
                  </p>
                </>
              )}
            </div>

            {/* Buscar en OpenFoodFacts — a button, not a link: the panel opens in
                place (there is no OFF-search route, and a pick must leave with the
                whole product in `state`, which a URL cannot carry). */}
            <button
              type="button"
              onClick={() => setOffOpen(true)}
              className="order-2 flex w-full items-center gap-3.5 rounded-[14px] border bg-card p-3.5 text-left md:p-4"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-amber-soft text-amber-ink md:size-12">
                <Search className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold md:text-[16px]">
                  {t('method.offTitle')}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.4] text-muted-foreground md:text-[12.5px]">
                  {t('method.offHint')}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
            </button>

            {/* Manual — a real link (the editor route takes the seed in `state`,
                which `Link` carries). */}
            <Link
              to={`${INGREDIENT_NEW_MANUAL}${location.search}`}
              state={{ name: query || null } satisfies IngredientEditorRouteState}
              className="order-3 flex w-full items-center gap-3.5 rounded-[14px] border bg-card p-3.5 text-left md:order-1 md:p-4"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent md:size-12">
                <PencilLine className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold md:text-[16px]">
                  {t('method.manualTitle')}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.4] text-muted-foreground md:text-[12.5px]">
                  {t('method.manualHint')}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </PageShell>
  );
}
