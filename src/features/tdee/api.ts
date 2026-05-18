import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type TdeeEstimate = Tables<'tdee_estimates'>;

/** Confidence band the adaptive filter emitted for an estimate (R-07 / D-B4). */
export type TdeeConfidence = 'low' | 'medium' | 'high';

export async function fetchLatestTdee(
  userId: string,
): Promise<TdeeEstimate | null> {
  const { data, error } = await supabase
    .from('tdee_estimates')
    .select('*')
    .eq('user_id', userId)
    .order('computed_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Normalize the stored `confidence` / `is_warmup` columns into the UI band
 * (R-07 / D-B4). The pure variance→band mapping lives in `src/core/tdee.ts`
 * and is computed by the edge at write time; the client only READS the
 * persisted band here (no recompute — the client has no filter state).
 *
 * `null` is returned when there is no estimate, or it predates R-07 (the
 * staged migration / new edge fn not yet live at Wave-3) so `confidence` is
 * still null — callers then simply show no badge, preserving the prior UI.
 */
export function tdeeConfidenceBand(
  estimate: TdeeEstimate | null | undefined,
): TdeeConfidence | null {
  if (!estimate) return null;
  if (estimate.is_warmup) return 'low';
  const c = estimate.confidence;
  if (c === 'low' || c === 'medium' || c === 'high') return c;
  return null;
}
