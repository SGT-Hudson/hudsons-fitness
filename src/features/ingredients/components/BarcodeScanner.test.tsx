// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

// IngredientDialog transitively imports @/lib/supabase — stub it.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// Stub the camera component so jsdom never touches getUserMedia.
vi.mock('./BarcodeScanner', () => ({
  BarcodeScanner: () => <div data-testid="scanner-stub" />,
}));

// Full mock for the hooks module — avoids heavy transitive imports
// (useAuth, supabase client, toast, etc.) failing under jsdom.
const mutateAsync = vi.fn();
vi.mock('../hooks', () => ({
  useBarcodeLookup: () => ({ mutateAsync, isPending: false }),
  useIngredients: vi.fn(),
  useLocalIngredientSearch: vi.fn(),
  useCreateManualIngredient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportFromOFF: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateIngredient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOFFSearch: () => ({ data: [], isFetching: false }),
}));

import { BarcodeTab } from './IngredientDialog';

function renderTab(onResolved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <BarcodeTab onResolved={onResolved} />
    </QueryClientProvider>,
  );
  return { onResolved };
}

beforeEach(async () => {
  mutateAsync.mockReset();
  await i18n.changeLanguage('es');
});

describe('BarcodeTab (Tier-2)', () => {
  it('keeps lookup disabled for an invalid EAN', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(screen.getByLabelText(i18n.t('ingredientes:barcode.manualLabel')), '12345');
    expect(
      screen.getByRole('button', { name: i18n.t('ingredientes:barcode.lookup') }),
    ).toBeDisabled();
  });

  it('resolves a valid EAN and calls onResolved with the OFF result', async () => {
    const user = userEvent.setup();
    const result = {
      code: '5000112637922', name: 'Coca-Cola', brand: 'Coca-Cola',
      thumbnailUrl: null, kcalPer100g: 42, proteinPer100g: 0,
      carbsPer100g: 10.6, fatPer100g: 0, fiberPer100g: 0,
    };
    mutateAsync.mockResolvedValue(result);
    const { onResolved } = renderTab();
    await user.type(
      screen.getByLabelText(i18n.t('ingredientes:barcode.manualLabel')),
      '5000112637922',
    );
    await user.click(screen.getByRole('button', { name: i18n.t('ingredientes:barcode.lookup') }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('5000112637922'));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(result));
  });

  it('shows "not found" when lookup resolves null', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(null);
    renderTab();
    await user.type(
      screen.getByLabelText(i18n.t('ingredientes:barcode.manualLabel')),
      '5000112637922',
    );
    await user.click(screen.getByRole('button', { name: i18n.t('ingredientes:barcode.lookup') }));
    await waitFor(() =>
      expect(screen.getByText(i18n.t('ingredientes:barcode.notFound'))).toBeTruthy(),
    );
  });
});
