import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const { getSession, onAuthStateChange, identify } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  identify: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession, onAuthStateChange, signOut: vi.fn() } },
}));
vi.mock('@/lib/stats', () => ({ identify }));

import { AuthProvider } from './AuthProvider';

const sessionOf = (id: string) => ({ user: { id } }) as unknown as Session;

let emit: (s: Session | null) => void;

function mount(session: Session | null) {
  let resolve!: (v: { data: { session: Session | null } }) => void;
  getSession.mockReturnValue(new Promise((r) => (resolve = r)));
  render(
    <AuthProvider>
      <div />
    </AuthProvider>,
  );
  return () => act(async () => resolve({ data: { session } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  onAuthStateChange.mockImplementation((cb: (e: string, s: Session | null) => void) => {
    emit = (s) => cb('SIGNED_IN', s);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

describe('AuthProvider identity', () => {
  it('does nothing while loading', () => {
    mount(sessionOf('u1'));
    expect(identify).not.toHaveBeenCalled();
  });

  it('identifies the user once loading ends', async () => {
    const finish = mount(sessionOf('u1'));
    await finish();
    await waitFor(() => expect(identify).toHaveBeenCalledTimes(1));
    expect(identify).toHaveBeenCalledWith('u1');
  });

  it('identifies null without a session', async () => {
    const finish = mount(null);
    await finish();
    await waitFor(() => expect(identify).toHaveBeenCalledWith(null));
    expect(identify).toHaveBeenCalledTimes(1);
  });

  it('identifies the new user when the auth state changes to another one', async () => {
    const finish = mount(sessionOf('u1'));
    await finish();
    await act(async () => emit(sessionOf('u2')));
    expect(identify).toHaveBeenLastCalledWith('u2');
  });

  it('identifies null when the session becomes null', async () => {
    const finish = mount(sessionOf('u1'));
    await finish();
    await act(async () => emit(null));
    expect(identify).toHaveBeenLastCalledWith(null);
  });
});
