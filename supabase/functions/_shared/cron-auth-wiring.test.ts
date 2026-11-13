// Wiring guard for the cron auth model (see keys.ts): every function pg_cron
// invokes is deployed with `verify_jwt = false` and gates itself with
// `isServerCall`, and no other function turns `verify_jwt` off. A function
// with `verify_jwt = false` and no in-code check would be public.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** Functions scheduled by pg_cron, from the migrations. */
function cronFunctions(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(new URL('supabase/migrations/', root))) {
    const sql = read(`supabase/migrations/${file}`);
    for (const m of sql.matchAll(/cron\.schedule\([\s\S]*?invoke_edge_function\('([a-z0-9-]+)'\)/g)) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

/** Functions with `verify_jwt = false` in supabase/config.toml. */
function noVerifyJwtFunctions(): string[] {
  const toml = read('supabase/config.toml');
  const names: string[] = [];
  for (const m of toml.matchAll(/^\[functions\.([a-z0-9-]+)\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/gm)) {
    if (/^\s*verify_jwt\s*=\s*false\s*$/m.test(m[2])) names.push(m[1]);
  }
  return names.sort();
}

/** Source of a function's handler, with comments stripped. */
function handlerSource(fn: string): string {
  return read(`supabase/functions/${fn}/index.ts`)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('cron auth wiring', () => {
  const crons = cronFunctions();

  it('finds the five scheduled functions', () => {
    expect(crons).toEqual([
      'cron-healthcheck',
      'daily-nutrition-snapshot',
      'recalculate-tdee',
      'recipe-photo-reap',
      'weekly-rollover',
    ]);
  });

  it('turns verify_jwt off for exactly the cron functions', () => {
    expect(noVerifyJwtFunctions()).toEqual(crons);
  });

  it.each(crons)('%s rejects the request before touching the database', (fn) => {
    const src = handlerSource(fn);
    const gate = src.search(/if \(!isServerCall\(req, env\)\) return unauthorized\(\);/);
    const client = src.search(/createClient\(/);
    expect(gate).toBeGreaterThan(-1);
    expect(client).toBeGreaterThan(gate);
  });

  it.each(crons)('%s builds its admin client from the new secret key', (fn) => {
    const src = handlerSource(fn);
    expect(src).toMatch(/secretKey\(env\)/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('delete-account keeps the gateway JWT check and reads the new keys', () => {
    expect(noVerifyJwtFunctions()).not.toContain('delete-account');
    const src = handlerSource('delete-account');
    expect(src).toMatch(/secretKey\(env\)/);
    expect(src).toMatch(/publishableKey\(env\)/);
    expect(src).not.toMatch(/SUPABASE_(SERVICE_ROLE|ANON)_KEY/);
  });
});
