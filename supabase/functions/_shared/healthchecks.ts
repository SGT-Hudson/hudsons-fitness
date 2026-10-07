// Healthchecks.io ping (hudsn-ops alerting). Best effort: never throws, 5 s
// timeout, no-op without a URL. Runs under Deno (edge) and Node (vitest):
// only web-standard APIs (fetch, AbortSignal.timeout).
export type PingSuffix = '' | 'start' | 'fail';

export async function pingHealthcheck(
  url: string | undefined,
  suffix: PingSuffix = '',
  body = '',
): Promise<void> {
  if (!url) return;
  const base = url.replace(/\/+$/, '');
  const target = suffix ? `${base}/${suffix}` : base;
  try {
    await fetch(target, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
  } catch (e) {
    // No URL: it carries the check key, and fetch errors embed it in the message.
    const msg = (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/[^\s)]+/g, '<url>');
    console.warn('healthchecks: ping failed', suffix || 'ok', msg);
  }
}
