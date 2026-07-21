import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

// hooks.ts transitively imports @/lib/supabase (via ./api) and AuthProvider;
// both throw/blow up without env/context in CI. This suite only exercises
// `useSetRecipePhoto`'s onError carve-out, so both are stubbed down to
// nothing, and the data functions it actually calls are mocked directly.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

const setRecipePhoto = vi.fn();
vi.mock('./photoStorage', () => ({
  setRecipePhoto: (...a: unknown[]) => setRecipePhoto(...a),
  clearRecipePhoto: vi.fn(),
}));

const toastError = vi.fn();
vi.mock('@/lib/toast-helpers', () => ({
  toastError: (...a: unknown[]) => toastError(...a),
  toastSaved: vi.fn(),
  toastDeleted: vi.fn(),
}));

import { PhotoDecodeError } from './photoResize';
import { useSetRecipePhoto } from './hooks';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  setRecipePhoto.mockReset();
  toastError.mockReset();
});

describe('useSetRecipePhoto — onError', () => {
  it('stays quiet on a PhotoDecodeError — the field already reports it inline', async () => {
    setRecipePhoto.mockRejectedValue(new PhotoDecodeError('could not decode "foto.heic" as an image'));
    const { result } = renderHook(() => useSetRecipePhoto(), { wrapper });

    await expect(
      result.current.mutateAsync({ recipeId: 'r-1', file: new File(['x'], 'f.heic') }),
    ).rejects.toBeInstanceOf(PhotoDecodeError);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastError).not.toHaveBeenCalled();
  });

  it('still toasts every other failure — this is the carve-out, not a blanket suppression', async () => {
    setRecipePhoto.mockRejectedValue({ code: '42501', message: 'denied' });
    const { result } = renderHook(() => useSetRecipePhoto(), { wrapper });

    await expect(
      result.current.mutateAsync({ recipeId: 'r-1', file: new File(['x'], 'f.jpg') }),
    ).rejects.toBeTruthy();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
