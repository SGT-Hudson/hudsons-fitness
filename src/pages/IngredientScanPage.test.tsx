// @vitest-environment jsdom
import '@/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import type { OFFProductLookup } from '@/lib/openfoodfacts';
import type { BarcodeCameraStatus } from '@/features/ingredients/useBarcodeCamera';

// The camera is the one thing jsdom cannot give us — no `getUserMedia`, no
// `BarcodeDetector`, no video pipeline. So the ENGINE is faked here and the
// page's four STATES are what gets driven: scanning / found / not-found /
// permission-denied, and where each one exits to. (The engine itself is
// unchanged by this wave; only a real device can exercise it — Task 7.)
const camera = {
  status: 'scanning' as BarcodeCameraStatus,
  torchAvailable: false,
  torchOn: false,
  restart: vi.fn(),
  toggleTorch: vi.fn(),
};
let fireDetected: ((code: string) => void) | null = null;

vi.mock('@/features/ingredients/useBarcodeCamera', () => ({
  useBarcodeCamera: (onDetected: (code: string) => void) => {
    fireDetected = onDetected;
    return { videoRef: { current: null }, ...camera };
  },
}));

// The page only needs the lookup; mocking the module keeps the supabase client
// (no env vars in CI) out of the import graph.
const mutateAsync = vi.fn();
vi.mock('@/features/ingredients/hooks', () => ({
  useBarcodeLookup: () => ({ mutateAsync, isPending: false }),
}));

import { IngredientScanPage } from './IngredientScanPage';

const CODE = '5000112637922';

const PRODUCT: OFFProductLookup = {
  code: CODE,
  name: 'Coca-Cola',
  brand: 'Coca-Cola',
  thumbnailUrl: null,
  kcalPer100g: 42,
  proteinPer100g: 0,
  carbsPer100g: 10.6,
  fatPer100g: 0,
  fiberPer100g: 0,
  sugarPer100g: 10.6,
  satFatPer100g: 0,
  saltPer100g: null,
  complete: true,
};

interface ProbeState {
  pathname: string;
  search: string;
  state: unknown;
}

function Probe() {
  const location = useLocation();
  return (
    <pre data-testid="probe">
      {JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        state: location.state,
      })}
    </pre>
  );
}

function probe(): ProbeState {
  return JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as ProbeState;
}

function renderScanner(entry = '/recipes/ingredients/scan') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/recipes/ingredients/scan" element={<IngredientScanPage />} />
          <Route path="/recipes/ingredients/new/manual" element={<Probe />} />
          <Route path="/recipes/ingredients" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tt = (key: string) => i18n.t(`ingredientes:${key}`);

beforeEach(async () => {
  await i18n.changeLanguage('es');
  mutateAsync.mockReset();
  camera.status = 'scanning';
  camera.torchAvailable = false;
  camera.torchOn = false;
  camera.restart.mockReset();
  camera.toggleTorch.mockReset();
  fireDetected = null;
});

afterEach(() => vi.unstubAllGlobals());

describe('IngredientScanPage — scanning', () => {
  it('shows the viewfinder, the status pill and the aim hint', () => {
    renderScanner();
    expect(screen.getByText(tt('scan.searching'))).toBeInTheDocument();
    expect(screen.getByText(tt('scan.aim'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tt('scan.close') })).toBeInTheDocument();
  });

  it('closes back to the list, keeping the active search', async () => {
    const user = userEvent.setup();
    renderScanner('/recipes/ingredients/scan?q=cola');
    await user.click(screen.getByRole('button', { name: tt('scan.close') }));
    await waitFor(() => expect(probe().pathname).toBe('/recipes/ingredients'));
    expect(probe().search).toBe('?q=cola');
  });

  it('offers the torch only when the camera reports one', () => {
    renderScanner();
    expect(screen.queryByRole('button', { name: tt('scan.torchOn') })).toBeNull();
  });

  it('toggles the torch when the camera has one', async () => {
    const user = userEvent.setup();
    camera.torchAvailable = true;
    renderScanner();
    await user.click(screen.getByRole('button', { name: tt('scan.torchOn') }));
    expect(camera.toggleTorch).toHaveBeenCalled();
  });
});

describe('IngredientScanPage — found', () => {
  it('carries the WHOLE OFF product into the editor (the import, not a manual row)', async () => {
    mutateAsync.mockResolvedValue(PRODUCT);
    renderScanner();
    await act(async () => fireDetected?.(CODE));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(CODE));
    await waitFor(() => expect(probe().pathname).toBe('/recipes/ingredients/new/manual'));
    expect(probe().state).toEqual({ offProduct: PRODUCT });
  });

  it('rides the active search through to the editor', async () => {
    mutateAsync.mockResolvedValue(PRODUCT);
    renderScanner('/recipes/ingredients/scan?q=cola');
    await act(async () => fireDetected?.(CODE));
    await waitFor(() => expect(probe().pathname).toBe('/recipes/ingredients/new/manual'));
    expect(probe().search).toBe('?q=cola');
  });
});

describe('IngredientScanPage — not found', () => {
  it('says OFF does not know the code and creates it manually WITH the scanned EAN', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(null);
    renderScanner();
    await act(async () => fireDetected?.(CODE));

    expect(await screen.findByText(tt('scan.notFoundTitle'))).toBeInTheDocument();
    // Still on the scanner: not-found is a decision point, not a teleport.
    expect(screen.queryByTestId('probe')).toBeNull();

    await user.click(screen.getByRole('button', { name: tt('scan.notFoundCreate') }));
    await waitFor(() => expect(probe().pathname).toBe('/recipes/ingredients/new/manual'));
    expect(probe().state).toEqual({ ean: CODE });
  });

  it('can go back to scanning instead (a mis-scan is the common repair)', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(null);
    renderScanner();
    await act(async () => fireDetected?.(CODE));
    await screen.findByText(tt('scan.notFoundTitle'));

    await user.click(screen.getByRole('button', { name: tt('scan.again') }));
    expect(camera.restart).toHaveBeenCalled();
    expect(screen.queryByText(tt('scan.notFoundTitle'))).toBeNull();
    expect(screen.getByText(tt('scan.searching'))).toBeInTheDocument();
  });
});

describe('IngredientScanPage — permission denied', () => {
  it('has its own copy — a blocked camera is fixable, not a generic failure', () => {
    camera.status = 'denied';
    renderScanner();
    expect(screen.getByText(tt('scan.deniedTitle'))).toBeInTheDocument();
    expect(screen.queryByText(tt('scan.errorTitle'))).toBeNull();
    expect(screen.getByRole('button', { name: tt('scan.deniedRetry') })).toBeInTheDocument();
  });

  it('a camera that fails for another reason gets the generic copy, not the denied one', () => {
    camera.status = 'error';
    renderScanner();
    expect(screen.getByText(tt('scan.errorTitle'))).toBeInTheDocument();
    expect(screen.queryByText(tt('scan.deniedTitle'))).toBeNull();
  });

  // THE hatch. Task 4's method picker deliberately ships no typed-EAN field on
  // touch because this exists: without it, a phone that denies the camera has no
  // way to enter a barcode at all.
  it('reaches the manual-EAN hatch FROM the denied state and routes with the product', async () => {
    const user = userEvent.setup();
    camera.status = 'denied';
    mutateAsync.mockResolvedValue(PRODUCT);
    renderScanner();

    await user.click(screen.getByRole('button', { name: tt('scan.manualOpen') }));
    await user.type(screen.getByLabelText(tt('barcode.manualLabel')), CODE);
    await user.click(screen.getByRole('button', { name: tt('barcode.lookup') }));

    await waitFor(() => expect(probe().pathname).toBe('/recipes/ingredients/new/manual'));
    expect(probe().state).toEqual({ offProduct: PRODUCT });
  });
});

describe('IngredientScanPage — the manual-EAN hatch', () => {
  it('keeps the lookup disabled for an invalid EAN', async () => {
    const user = userEvent.setup();
    renderScanner();
    await user.click(screen.getByRole('button', { name: tt('scan.manualOpen') }));
    await user.type(screen.getByLabelText(tt('barcode.manualLabel')), '12345');
    expect(screen.getByRole('button', { name: tt('barcode.lookup') })).toBeDisabled();
  });

  it('a typed code OFF does not know reaches the editor as a bare EAN', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(null);
    renderScanner();
    await user.click(screen.getByRole('button', { name: tt('scan.manualOpen') }));
    await user.type(screen.getByLabelText(tt('barcode.manualLabel')), CODE);
    await user.click(screen.getByRole('button', { name: tt('barcode.lookup') }));

    expect(await screen.findByText(tt('scan.notFoundTitle'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tt('scan.notFoundCreate') }));
    await waitFor(() => expect(probe().pathname).toBe('/recipes/ingredients/new/manual'));
    expect(probe().state).toEqual({ ean: CODE });
  });
});

describe('IngredientScanPage — a lookup that never answered', () => {
  it('returns to the viewfinder on a transport error (the hook already toasted)', async () => {
    mutateAsync.mockRejectedValue(new Error('network'));
    renderScanner();
    await act(async () => fireDetected?.(CODE));

    await waitFor(() => expect(camera.restart).toHaveBeenCalled());
    expect(screen.getByText(tt('scan.searching'))).toBeInTheDocument();
    expect(screen.queryByTestId('probe')).toBeNull();
  });
});
