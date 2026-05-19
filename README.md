# Hudson's Fitness

[![CI](https://github.com/SGT-Hudson/hudsons-fitness/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/SGT-Hudson/hudsons-fitness/actions/workflows/ci.yml)

Bilingual (ES/EN) PWA for tracking body composition, macros, recipes, weekly meal plans, and dietary phases. React 18 + Vite + TypeScript SPA talking directly to Supabase.

## Quick start

Requires Node 20+ and pnpm 10+.

```bash
git clone https://github.com/SGT-Hudson/hudsons-fitness.git
cd hudsons-fitness
pnpm install
pnpm dev                          # http://localhost:5173
```

Create `.env.local` with the public-tier Supabase values:

```
VITE_SUPABASE_URL=https://upvraruehzurbetzrxov.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_Yy7z5ewxouiqtnwaCd7N4g_l4TKVD9a
```

## Documentation

Start at `CLAUDE.md`; full docs in `docs/`.
