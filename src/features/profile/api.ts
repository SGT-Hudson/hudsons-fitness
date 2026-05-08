import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@/types/database';

export type Profile = Tables<'profiles'>;

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  userId: string,
  patch: TablesUpdate<'profiles'>,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export function isProfileOnboarded(p: Profile | null | undefined): boolean {
  if (!p) return false;
  return (
    p.sex !== null &&
    p.birth_date !== null &&
    p.height_cm !== null &&
    p.initial_weight_kg !== null &&
    p.bone_kg !== null
  );
}
