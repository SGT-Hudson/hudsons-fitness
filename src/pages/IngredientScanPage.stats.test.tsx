// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

let fireDetected: ((code: string) => void) | null = null;
const restart = vi.fn();
vi.mock('@/features/ingredients/useBarcodeCamera', () => ({
  useBarcodeCamera: (onDetected: (code: string) => void) => {
    fireDetected = onDetected;
    return {
      videoRef: { current: null }, status: 'scanning', torchAvailable: false, torchOn: false,
      restart, toggleTorch: vi.fn(),
    };
  },
}));
const mutateAsync = vi.fn();
vi.mock('@/features/ingredients/hooks', () => ({
  useBarcodeLookup: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));

import { track } from '@/lib/stats';
import { IngredientScanPage } from './IngredientScanPage';

const CODE = '5000112637922';
const PRODUCT = { code: CODE, name: 'Coca-Cola', brand: 'Coca-Cola', thumbnailUrl: null, kcalPer100g: 42,
  proteinPer100g: 0, carbsPer100g: 10.6, fatPer100g: 0, fiberPer100g: 0, sugarPer100g: 10.6,
  satFatPer100g: 0, saltPer100g: null, complete: true };

function renderScanner() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/recipes/ingredients/scan']}>
        <Routes>
          <Route path="/recipes/ingredients/scan" element={<IngredientScanPage />} />
          <Route path="/recipes/ingredients/new/manual" element={<div>editor</div>} />
          <Route path="/recipes/ingredients" element={<div>list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tt = (key: string) => i18n.t(`ingredientes:${key}`);

beforeEach(async () => {
  vi.clearAllMocks();
  mutateAsync.mockReset();
  await i18n.changeLanguage('es');
});

describe('IngredientScanPage events', () => {
  it('tracks escanear-ingrediente (encontrado) when the camera finds a product', async () => {
    mutateAsync.mockResolvedValue(PRODUCT);
    renderScanner();
    await act(async () => fireDetected?.(CODE));
    await screen.findByText('editor');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('escanear-ingrediente', { resultado: 'encontrado' });
  });

  it('tracks escanear-ingrediente (no-encontrado) when the camera code is unknown', async () => {
    mutateAsync.mockResolvedValue(null);
    renderScanner();
    await act(async () => fireDetected?.(CODE));
    await screen.findByText(tt('scan.notFoundTitle'));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('escanear-ingrediente', { resultado: 'no-encontrado' });
  });

  it('tracks nothing for a typed barcode', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(PRODUCT);
    renderScanner();
    await user.click(screen.getByRole('button', { name: tt('scan.manualOpen') }));
    await user.type(screen.getByLabelText(tt('barcode.manualLabel')), CODE);
    await user.click(screen.getByRole('button', { name: tt('barcode.lookup') }));
    await screen.findByText('editor');
    expect(track).not.toHaveBeenCalled();
  });

  it('tracks nothing on a network error', async () => {
    mutateAsync.mockRejectedValue(new Error('network'));
    renderScanner();
    await act(async () => fireDetected?.(CODE));
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect(track).not.toHaveBeenCalled();
  });
});
