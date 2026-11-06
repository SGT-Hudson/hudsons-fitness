// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

const signUp = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signUp: (...a: unknown[]) => signUp(...a) } } }));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));

import { track } from '@/lib/stats';
import { SignupPage } from './SignupPage';

async function submit() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText(i18n.t('auth:displayName')), 'Ana');
  await user.type(screen.getByLabelText(i18n.t('auth:email')), 'ana@example.com');
  await user.type(screen.getByLabelText(i18n.t('auth:password')), 'supersecret1');
  await user.click(screen.getByRole('button', { name: i18n.t('auth:signUp') }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('es');
});

describe('SignupPage events', () => {
  it('tracks registrarse for a new account', async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [{ id: 'x' }] } }, error: null });
    await submit();
    await screen.findByText(i18n.t('auth:checkEmail'));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('registrarse');
  });

  it('tracks nothing when the email is already registered (identities empty)', async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [] } }, error: null });
    await submit();
    await screen.findByText(i18n.t('auth:checkEmail'));
    expect(track).not.toHaveBeenCalled();
  });

  it('tracks nothing on an auth error', async () => {
    signUp.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } });
    await submit();
    await screen.findByText('boom');
    expect(track).not.toHaveBeenCalled();
  });
});
