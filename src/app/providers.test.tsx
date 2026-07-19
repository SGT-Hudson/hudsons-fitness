// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppProviders } from './providers';

// AppProviders also mounts AuthProvider, which talks to the real Supabase
// client on mount (getSession + onAuthStateChange). Stub it at the module
// boundary so this test can render the full provider tree in jsdom without
// Supabase env vars or a network call — the query-defaults behaviour under
// test doesn't depend on auth state at all.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

afterEach(() => {
  // onlineManager is a module-level singleton inside @tanstack/react-query —
  // leaving it flipped to offline would bleed into every other test file.
  onlineManager.setOnline(true);
});

function RejectingQueryProbe({ fetchStatusLog }: { fetchStatusLog: string[] }) {
  const query = useQuery({
    queryKey: ['offline-probe'],
    queryFn: () => Promise.reject(new Error('boom')),
  });
  fetchStatusLog.push(query.fetchStatus);
  return (
    <div>
      <span data-testid="status">{query.status}</span>
      <span data-testid="fetch-status">{query.fetchStatus}</span>
    </div>
  );
}

function DefaultsProbe() {
  const queryClient = useQueryClient();
  const defaults = queryClient.getDefaultOptions().queries ?? {};
  return (
    <span data-testid="defaults">
      {JSON.stringify({
        staleTime: defaults.staleTime,
        refetchOnWindowFocus: defaults.refetchOnWindowFocus,
        retry: defaults.retry,
      })}
    </span>
  );
}

describe('AppProviders query defaults', () => {
  // networkMode must be 'always', not 'offlineFirst'. Both bypass the online
  // check for the *first* attempt, but query-core's retryer only bypasses the
  // check on the *retry* for 'always' (see canContinue() in
  // @tanstack/query-core's retryer.ts). With 'offlineFirst' + retry: 1, a
  // persistently-offline query fires once, fails, then the retry re-pauses
  // waiting for reconnect — it never reaches `error`, so the fetchStatus log
  // below would show a permanent 'paused' instead of settling. If this test
  // is ever "simplified" back to 'offlineFirst', it must fail here, not pass.
  it('reaches an error state for a rejecting query while the browser reports itself offline', async () => {
    onlineManager.setOnline(false);
    const fetchStatusLog: string[] = [];

    render(
      <AppProviders>
        <RejectingQueryProbe fetchStatusLog={fetchStatusLog} />
      </AppProviders>,
    );

    // retry: 1 means this settles only after a second failed attempt, with a
    // backoff delay between them — give it real room before failing.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'), {
      timeout: 5000,
    });
    expect(screen.getByTestId('fetch-status')).toHaveTextContent('idle');
    // onlineManager was never set back online during the run above — reaching
    // 'error' here proves the whole retry budget ran while genuinely offline,
    // never parking in 'paused' (the offlineFirst failure mode).
    expect(fetchStatusLog).not.toContain('paused');
  });

  it('keeps the sibling query defaults intact', () => {
    render(
      <AppProviders>
        <DefaultsProbe />
      </AppProviders>,
    );

    expect(screen.getByTestId('defaults')).toHaveTextContent(
      JSON.stringify({ staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 }),
    );
  });
});
