// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));
// The sex Select (Radix) is not drivable in jsdom and validation is not under test: let the form submit as is.
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => async (values: unknown) => ({ values, errors: {} }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

const mutateAsync = vi.fn();
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: null, isLoading: false }),
  useUpdateProfile: () => ({ mutateAsync, isPending: false }),
}));

import { track } from '@/lib/stats';
import { OnboardingPage } from './OnboardingPage';

async function submit() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: i18n.t('onboarding:submit') }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('es');
});

describe('OnboardingPage events', () => {
  it('tracks completar-onboarding once the profile is saved', async () => {
    mutateAsync.mockResolvedValue({});
    await submit();
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith('completar-onboarding');
  });

  it('tracks nothing when the save is rejected', async () => {
    mutateAsync.mockRejectedValue(new Error('nope'));
    await submit();
    await screen.findByText('nope');
    expect(track).not.toHaveBeenCalled();
  });
});
