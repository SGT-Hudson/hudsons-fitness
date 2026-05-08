import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
  );
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
