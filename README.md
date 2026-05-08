# Hudson's Fitness

Bilingual (ES/EN) web app for tracking body composition, macros, recipes, weekly meal plans, and dietary phases. React + Supabase.

## Local development

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
cp .env.example .env.local        # fill in your Supabase URL + publishable key
pnpm dev                          # http://localhost:5173
```

Other scripts:

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm build       # production build to ./dist
pnpm preview     # preview ./dist locally
```

## Architecture

See [`hudsons-fitness-architecture.md`](./hudsons-fitness-architecture.md) for the full MVP spec.

## Deploying to Vercel

The repo is Vite-ready: `vercel.json` includes the SPA fallback rewrite and asset cache headers. To deploy:

1. **Import the repo** in Vercel (`+ Add New… → Project → Import` → pick `SGT-Hudson/hudsons-fitness`).
2. **Framework preset** should auto-detect as **Vite**. If not, set it manually.
3. **Build & install commands**: leave defaults — Vercel detects `pnpm` from `pnpm-lock.yaml`.
4. **Environment variables** — add both, scope to Production + Preview + Development:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://upvraruehzurbetzrxov.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_Yy7z5ewxouiqtnwaCd7N4g_l4TKVD9a` |

5. Click **Deploy**.

Once deployed, copy the production URL (e.g. `https://hudsonfitness.vercel.app`) and update Supabase auth so signup confirmation emails redirect to it:

1. Open the Supabase dashboard → **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel production URL.
3. Add the Vercel preview pattern to **Redirect URLs**: `https://hudsonfitness-*.vercel.app/**` (so PR previews work too).
4. Save.
