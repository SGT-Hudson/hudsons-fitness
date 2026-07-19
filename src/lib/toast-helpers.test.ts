// The regression guard: `toastError` used to pass `err.message` straight
// through, so PostgREST jargon reached users in English. These tests fail if
// any raw error text makes it into the toast description again.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import i18n from '@/i18n';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));

import { toastError } from './toast-helpers';

describe('toastError', () => {
  beforeEach(async () => {
    toast.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await i18n.changeLanguage('es');
  });

  it('never shows the raw message, even when the error has one', () => {
    toastError(new Error('duplicate key value violates unique constraint "recipes_pkey"'));
    const { description } = toast.mock.calls[0][0];
    expect(description).not.toContain('recipes_pkey');
    expect(description).not.toContain('duplicate key value');
    expect(description).toBe(i18n.t('common:errors.generic'));
  });

  it('translates a recognised PostgREST error to its own copy', () => {
    toastError({ code: '23505', message: 'duplicate key value' });
    expect(toast.mock.calls[0][0].description).toBe(i18n.t('common:errors.duplicate'));
  });

  it('sends the raw error to the console, where it is useful', () => {
    const err = { code: '42501', message: 'permission denied for table recipes' };
    toastError(err);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), err);
  });

  it('still uses the destructive variant and the shared error title', () => {
    toastError(new Error('boom'));
    expect(toast.mock.calls[0][0]).toMatchObject({
      variant: 'destructive',
      title: i18n.t('common:toasts.errorTitle'),
    });
  });

  it('ignores every extra positional argument react-query passes', () => {
    // react-query calls onError(error, variables, context). `variables` is a
    // bare string on the delete mutations — this asserts that uuid never
    // reaches the user.
    (toastError as (...args: unknown[]) => void)(
      { code: '23505' },
      'a3f1c2de-0000-4444-8888-000000000000',
      undefined,
    );
    expect(toast.mock.calls[0][0].description).toBe(i18n.t('common:errors.duplicate'));
  });

  it('is safe to pass straight to react-query onError', () => {
    const onError: (e: unknown, v: unknown, c: unknown) => void = toastError;
    onError(new Error('boom'), { id: 1 }, undefined);
    expect(toast.mock.calls[0][0].description).toBe(i18n.t('common:errors.generic'));
  });
});
