// Shared pure library-model constants and helpers (R-01 / D-A2, D-A3, D-A4).
//
// ONE dependency-free, runtime-agnostic, camelCase home for the constants
// the ★ Library Contribution & Lifecycle Model relies on across runtimes.
// It uses ONLY standard JS/TS (no React, no `@/` alias, no Node/Deno-only
// globals). Both runtimes import it directly with no transpile/codegen:
//   - the client/Vitest via `@/core/library` (Vite alias / tsc paths),
//   - the edge (e.g. `delete-account`, the upcoming reconciliation call site)
//     via a relative path from `supabase/functions/_shared/` or the function
//     directory.
//
// Specced in `docs/superpowers/specs/2026-05-18-library-model-phase1-design.md`
// (§4 — reserved anon owner) and sequenced by
// `docs/superpowers/plans/2026-05-18-library-model-phase1-plan.md` (Task 1).

/**
 * The reserved anon owner id used by the ★ Library model. Any
 * `ingredients.created_by_user_id` or `recipes.created_by_user_id` equal to
 * this value means the original creator hid the item (or had their account
 * deleted), the item is permanently anonymized, and no real user may UPDATE
 * or DELETE it (RLS enforces). Distinct from `null` (which means
 * "immutable system seed" — pre-existing convention) and distinct from the
 * nil UUID `000…000`.
 *
 * Seeded as a real, non-authenticatable `auth.users` row by migration
 * `supabase/migrations/20260520120000_r01_library_anon_seed.sql`. The
 * value is provably NOT `gen_random_uuid()` output (RFC-4122 v4 sets
 * specific version / variant bits in positions our value leaves zero).
 *
 * **Do not allocate a new constant for this anywhere else.** Every call
 * site — client RLS predicates, edge reconciliation, future Phase-2 reaper
 * — imports this single source.
 */
export const LIBRARY_ANON_OWNER_ID =
  '00000000-0000-0000-0000-00000000a0a0' as const;

/** Type-narrowing helper: is the given id the reserved anon owner? */
export function isLibraryAnonOwner(id: string | null | undefined): boolean {
  return id === LIBRARY_ANON_OWNER_ID;
}
