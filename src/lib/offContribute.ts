import { supabase } from '@/lib/supabase';
import { isValidEan } from '@/lib/openfoodfacts';
import {
  isContributionEligible,
  type OffContributionInput,
} from '@/core/offContribute';

export interface ContributeArgs extends OffContributionInput {
  mode: 'new' | 'complete';
}

/**
 * Fire-and-forget contribution to OFF via the edge function. Returns
 * immediately; never throws and never blocks the caller. Skips silently when
 * the user opted out, the barcode is invalid, or the data fails the
 * eligibility gate. A failed contribution is a non-event — the ingredient is
 * already saved locally.
 */
export function contributeToOff(args: ContributeArgs, optedIn: boolean): void {
  if (!optedIn) return;
  if (!isValidEan(args.barcode)) return;
  if (!isContributionEligible(args)) return;

  void supabase.functions
    .invoke('off-contribute', {
      body: {
        barcode: args.barcode,
        name: args.name,
        brand: args.brand,
        kcalPer100g: args.kcalPer100g,
        proteinPer100g: args.proteinPer100g,
        carbsPer100g: args.carbsPer100g,
        fatPer100g: args.fatPer100g,
        fiberPer100g: args.fiberPer100g,
        mode: args.mode,
      },
    })
    .catch(() => {
      // swallow — fire-and-forget
    });
}
