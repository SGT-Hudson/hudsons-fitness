import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

// hooks.ts transitively imports @/lib/supabase (via ./api) and AuthProvider.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
const getExercise = vi.fn();
vi.mock('./api', () => ({ getExercise: (...a: unknown[]) => getExercise(...a) }));

import { useExercise } from './hooks';

const fake = { id: 'ex-1', name_es: 'Press de banca' };

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getExercise.mockReset();
});

describe('useExercise', () => {
  it('fetches by id when enabled and id is present', async () => {
    getExercise.mockResolvedValue(fake);
    const { result } = renderHook(() => useExercise('ex-1', { enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fake);
    expect(getExercise).toHaveBeenCalledWith('ex-1');
  });

  it('does not fetch when disabled', () => {
    getExercise.mockResolvedValue(fake);
    renderHook(() => useExercise('ex-1', { enabled: false }), { wrapper });
    expect(getExercise).not.toHaveBeenCalled();
  });

  it('does not fetch when id is undefined', () => {
    getExercise.mockResolvedValue(fake);
    renderHook(() => useExercise(undefined, { enabled: true }), { wrapper });
    expect(getExercise).not.toHaveBeenCalled();
  });
});
