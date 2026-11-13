// Tier-4 (R-32) setup. Runs before any test module is imported.
import WebSocket from 'ws';
import { installFetchCounter } from './fetchCounter';

// Node 20 has no global WebSocket, and `createClient` throws
// "native WebSocket not found" without one — so importing `@/lib/supabase`
// would be fatal. DELETE THIS BLOCK when the project moves to Node 22,
// which provides WebSocket natively.
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

// Fail closed. `.env.test.local` in this repo holds the agent-browser QA
// user's PRODUCTION credentials; if anything leaks them into this tier, the
// suite would run against production. The config sets `test.env` explicitly,
// and this is the second, independent defence.
const url = import.meta.env.VITE_SUPABASE_URL;
if (!url) {
  throw new Error(
    'Tier-4: VITE_SUPABASE_URL is unset. Run `supabase status -o env` and export SUPABASE_TEST_ANON_KEY.',
  );
}
const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(
    `Tier-4 refuses to run against a non-local host: ${host}. This tier only ever targets the local Supabase stack.`,
  );
}

installFetchCounter();
