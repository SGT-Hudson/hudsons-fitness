import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { pingHealthcheck } from './healthchecks.ts';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());
afterAll(() => vi.unstubAllGlobals());

describe('pingHealthcheck (edge helper)', () => {
  it('is a no-op without a URL', async () => {
    await pingHealthcheck(undefined, 'fail', 'x');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to url/suffix with the body', async () => {
    fetchMock.mockResolvedValue(new Response('OK'));
    await pingHealthcheck('https://hc-ping.com/k/hfit-cron', 'fail', '{"alert":true}');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hc-ping.com/k/hfit-cron/fail',
      expect.objectContaining({ method: 'POST', body: '{"alert":true}' }),
    );
  });

  it('pings the bare URL on success and tolerates a trailing slash', async () => {
    fetchMock.mockResolvedValue(new Response('OK'));
    await pingHealthcheck('https://hc-ping.com/k/hfit-cron/');
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc-ping.com/k/hfit-cron');
  });

  it('never throws when fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(pingHealthcheck('https://hc-ping.com/k/hfit-cron')).resolves.toBeUndefined();
  });
});
