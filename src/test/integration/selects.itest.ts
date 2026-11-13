import { describe, expect, it } from 'vitest';
import { REGISTRY } from './registry';
import { fetchCount, resetFetchCount } from './fetchCounter';

// Allow-list, not deny-list: an unrecognised code must fail the build.
// PGRST116 = "0 rows" from `.single()`, which is the EXPECTED outcome here —
// every case queries ids that match nothing on purpose. Anything else means
// the select string itself is wrong: 42703 undefined column, 42P01 undefined
// table, PGRST100 select parse error, PGRST200 no relationship for an embed.
const ALLOWED_ERROR_CODES = new Set(['PGRST116']);

function describeError(err: unknown): string {
  if (typeof err !== 'object' || err === null) return String(err);
  const e = err as { code?: string; message?: string; details?: string; hint?: string };
  return `code=${e.code ?? '<none>'} message=${e.message ?? '<none>'} details=${e.details ?? '<none>'} hint=${e.hint ?? '<none>'}`;
}

function isAllowed(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  return typeof code === 'string' && ALLOWED_ERROR_CODES.has(code);
}

describe('PostgREST select strings are valid against the real schema', () => {
  for (const testCase of REGISTRY) {
    it(`${testCase.id} (${testCase.file})`, async () => {
      resetFetchCount();
      try {
        await testCase.run();
      } catch (err) {
        if (!isAllowed(err)) {
          throw new Error(
            `${testCase.id}: the query was rejected — ${describeError(err)}`,
          );
        }
      }
      expect(
        fetchCount(),
        `${testCase.id} completed without issuing a request: it short-circuited, so this case exercises no select string. Give it arguments that reach PostgREST.`,
      ).toBeGreaterThan(0);
    });
  }
});
