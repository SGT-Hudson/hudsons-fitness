import { describe, expect, it } from 'vitest';
import { supabase } from '@/lib/supabase';
import { fetchCount, resetFetchCount } from './fetchCounter';

describe('Tier-4 harness', () => {
  it('reaches the local stack and counts the request', async () => {
    resetFetchCount();
    const { error } = await supabase.from('exercises').select('id').limit(1);
    expect(error).toBeNull();
    expect(fetchCount()).toBeGreaterThan(0);
  });
});
