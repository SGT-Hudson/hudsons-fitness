// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireRestAlarm } from './alarm';

describe('fireRestAlarm', () => {
  it('does not throw when vibrate / AudioContext are unavailable (jsdom)', () => {
    expect(() => fireRestAlarm()).not.toThrow();
  });

  it('calls navigator.vibrate when present', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    fireRestAlarm();
    expect(vibrate).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
