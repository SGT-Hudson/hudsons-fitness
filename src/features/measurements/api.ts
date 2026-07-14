import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert } from '@/types/database';

export type BodyMeasurement = Tables<'body_measurements'>;
export type SmoothedMeasurement = Tables<'body_measurements_smoothed'>;

export async function fetchSmoothedMeasurements(
  userId: string,
  fromDate: string | null,
): Promise<SmoothedMeasurement[]> {
  let query = supabase
    .from('body_measurements_smoothed')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: true });
  if (fromDate) query = query.gte('measured_on', fromDate);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export interface MeasurementInput {
  measured_on: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_pct: number | null;
  water_pct: number | null;
  notes: string | null;
}

export async function fetchRecentMeasurements(
  userId: string,
  limit = 30,
): Promise<BodyMeasurement[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Every measurement from `fromDate` on (null = the whole record), newest first.
 * The history screen needs the full range, not a head of it — `limit` is what
 * separates this from `fetchRecentMeasurements`.
 */
export async function fetchMeasurementsSince(
  userId: string,
  fromDate: string | null,
): Promise<BodyMeasurement[]> {
  let query = supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: false });
  if (fromDate) query = query.gte('measured_on', fromDate);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** The oldest measurement on record — the history footer's "inicio del registro". */
export async function fetchFirstMeasurement(
  userId: string,
): Promise<BodyMeasurement | null> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchLatestMeasurement(
  userId: string,
): Promise<BodyMeasurement | null> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMeasurementByDate(
  userId: string,
  measuredOn: string,
): Promise<BodyMeasurement | null> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .eq('measured_on', measuredOn)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertMeasurement(
  userId: string,
  input: MeasurementInput,
): Promise<BodyMeasurement> {
  const payload: TablesInsert<'body_measurements'> = {
    user_id: userId,
    ...input,
  };
  const { data, error } = await supabase
    .from('body_measurements')
    .upsert(payload, { onConflict: 'user_id,measured_on' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from('body_measurements').delete().eq('id', id);
  if (error) throw error;
}
