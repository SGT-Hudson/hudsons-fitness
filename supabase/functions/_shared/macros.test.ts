import { describe, it, expect } from 'vitest';

// R-17 / D-F3 PARITY NET.
//
// One golden-vector fixture set asserted against BOTH code paths, run under a
// single (Node/Vitest) runtime:
//   - the CLIENT path  → src/features/recipes/macros.ts (camelCase),
//   - the EDGE path     → supabase/functions/_shared/macros.ts
//                         (the shared camel core + the snake_case DB adapter).
// Both delegate to the single shared core (src/core/macros.ts). This guards
// against the two CODE paths diverging; it does NOT exercise the Deno runtime
// (the edge path is imported and run under Node here, not Deno), so it is a
// code-divergence guarantee, not a Node-vs-Deno runtime-parity one. If the two
// code paths ever diverge, this suite fails in CI — that is the regression
// guarantee the R-17 extraction rests on. The pre-existing client suites
// (src/features/recipes/macros.test.ts, src/lib/macros.test.ts,
// src/lib/dates.test.ts, etc.) are unchanged and still pass against the
// delegating client API.

import {
  computeRecipeMacros as clientComputeRecipeMacros,
  computeRecipeSub as clientComputeRecipeSub,
  rowContribution as clientRowContribution,
  roundMacro as clientRoundMacro,
  type RecipeRowMacrosInput,
} from '../../../src/features/recipes/macros.ts';

import {
  ingredientMacros as edgeIngredientMacros,
  recipePerServingMacros as edgeRecipePerServingMacros,
  computeRecipeMacros as edgeComputeRecipeMacros,
  roundMacro as edgeRoundMacro,
  add as edgeAdd,
  scale as edgeScale,
  computeRecipeSub as edgeComputeRecipeSub,
  toSnakeMacros,
  EMPTY_SNAKE,
  isoDateInTZ as edgeIsoDateInTZ,
  previousDayInTZ as edgePreviousDayInTZ,
  mondayOfTodayInTZ as edgeMondayOfTodayInTZ,
  type CoreIngredient,
} from './macros.ts';

import {
  isoDateInTZ as clientIsoDateInTZ,
  previousDayInTZ as clientPreviousDayInTZ,
  mondayOfTodayInTZ as clientMondayOfTodayInTZ,
} from '../../../src/lib/dates.ts';

// ── Golden-vector fixtures (one source of truth for both paths) ────────────

interface GoldenIngredient {
  unit_type: string;
  kcal_per_unit: number;
  protein_g_per_unit: number;
  carbs_g_per_unit: number;
  fat_g_per_unit: number;
  fiber_g_per_unit: number;
}

const gramIng: GoldenIngredient = {
  unit_type: 'gram',
  kcal_per_unit: 100,
  protein_g_per_unit: 10,
  carbs_g_per_unit: 5,
  fat_g_per_unit: 2,
  fiber_g_per_unit: 1,
};

const unitIng: GoldenIngredient = {
  unit_type: 'unit',
  kcal_per_unit: 90,
  protein_g_per_unit: 7,
  carbs_g_per_unit: 12,
  fat_g_per_unit: 3,
  fiber_g_per_unit: 2,
};

interface RecipeFixture {
  name: string;
  servings: number;
  rows: Array<{
    ingredient: GoldenIngredient;
    quantity: number;
    perServing: boolean;
  }>;
}

const RECIPES: RecipeFixture[] = [
  {
    name: 'two gram rows, 2 servings',
    servings: 2,
    rows: [
      { ingredient: gramIng, quantity: 100, perServing: false },
      { ingredient: gramIng, quantity: 200, perServing: false },
    ],
  },
  {
    name: 'per-serving scaling, 3 servings',
    servings: 3,
    rows: [{ ingredient: gramIng, quantity: 10, perServing: true }],
  },
  {
    name: 'mixed unit + gram, fractional servings',
    servings: 2.5,
    rows: [
      { ingredient: unitIng, quantity: 3, perServing: false },
      { ingredient: gramIng, quantity: 175, perServing: true },
    ],
  },
  {
    name: 'servings <= 0 falls back to 1',
    servings: 0,
    rows: [{ ingredient: gramIng, quantity: 100, perServing: false }],
  },
  {
    name: 'empty recipe',
    servings: 4,
    rows: [],
  },
];

function toClientRows(r: RecipeFixture): RecipeRowMacrosInput[] {
  return r.rows.map((row) => ({
    ingredient: row.ingredient,
    quantity: row.quantity,
    perServing: row.perServing,
  }));
}

function toCoreIngredient(ing: GoldenIngredient): CoreIngredient {
  return {
    unitType: ing.unit_type,
    kcalPerUnit: ing.kcal_per_unit,
    proteinGPerUnit: ing.protein_g_per_unit,
    carbsGPerUnit: ing.carbs_g_per_unit,
    fatGPerUnit: ing.fat_g_per_unit,
    fiberGPerUnit: ing.fiber_g_per_unit,
  };
}

/** Re-derive a recipe's per-serving total using the edge primitives only. */
function edgePerServing(r: RecipeFixture) {
  const servings = r.servings > 0 ? r.servings : 1;
  let total = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  for (const row of r.rows) {
    const qty = row.perServing ? row.quantity * servings : row.quantity;
    total = edgeAdd(total, edgeIngredientMacros(toCoreIngredient(row.ingredient), qty));
  }
  return edgeScale(total, 1 / servings);
}

// ── Recipe-macro parity: client path === edge path ─────────────────────────

describe('R-17 parity — recipe macros (client vs edge, golden vectors)', () => {
  for (const r of RECIPES) {
    it(`${r.name}: client total/perServing === edge total/perServing`, () => {
      const client = clientComputeRecipeMacros({
        servings: r.servings,
        rows: toClientRows(r),
      });
      const edge = edgeComputeRecipeMacros({
        servings: r.servings,
        ingredients: r.rows.map((row) => ({
          quantity: row.quantity,
          perServing: row.perServing,
          ingredient: toCoreIngredient(row.ingredient),
        })),
      });
      expect(edge.total).toEqual(client.total);
      expect(edge.perServing).toEqual(client.perServing);

      // And the standalone edge per-serving helper agrees too.
      expect(edgeRecipePerServingMacros({
        servings: r.servings,
        ingredients: r.rows.map((row) => ({
          quantity: row.quantity,
          perServing: row.perServing,
          ingredient: toCoreIngredient(row.ingredient),
        })),
      })).toEqual(client.perServing);

      // Hand-rolled edge primitive accumulation matches the client too.
      expect(edgePerServing(r)).toEqual(client.perServing);
    });
  }

  it('rowContribution (client) === ingredientMacros (edge core) per row', () => {
    for (const r of RECIPES) {
      const servings = r.servings > 0 ? r.servings : 1;
      for (const row of r.rows) {
        const qty = row.perServing ? row.quantity * servings : row.quantity;
        expect(clientRowContribution(
          { ingredient: row.ingredient, quantity: row.quantity, perServing: row.perServing },
          servings,
        )).toEqual(edgeIngredientMacros(toCoreIngredient(row.ingredient), qty));
      }
    }
  });

  it('roundMacro is identical on both paths', () => {
    for (const n of [1.24, 1.25, 199.999, 0, 33.3333, -2.05]) {
      expect(edgeRoundMacro(n)).toBe(clientRoundMacro(n));
    }
  });
});

// ── Sub-macro parity: client path === edge path (incl. null/unknown) ───────

describe('U-1 parity — sub-macros (client vs edge, null-aware)', () => {
  // ingredient with a KNOWN sugar but UNKNOWN (null) saturated fat.
  const subRow = {
    ingredient: {
      unit_type: 'gram',
      kcal_per_unit: 100,
      protein_g_per_unit: 10,
      carbs_g_per_unit: 5,
      fat_g_per_unit: 2,
      fiber_g_per_unit: 1,
      sugar_g_per_unit: 8,
      saturated_fat_g_per_unit: null,
    },
    quantity: 250,
    perServing: false,
  };
  const subRow2 = {
    ingredient: {
      unit_type: 'gram',
      kcal_per_unit: 50,
      protein_g_per_unit: 1,
      carbs_g_per_unit: 9,
      fat_g_per_unit: 4,
      fiber_g_per_unit: 0,
      sugar_g_per_unit: null,
      saturated_fat_g_per_unit: 3,
    },
    quantity: 100,
    perServing: false,
  };

  it('computeRecipeSub total/perServing identical across paths', () => {
    const opts = { servings: 2, rows: [subRow, subRow2] };
    const client = clientComputeRecipeSub(opts);
    const edge = edgeComputeRecipeSub({
      servings: opts.servings,
      ingredients: opts.rows.map((r) => ({
        quantity: r.quantity,
        perServing: r.perServing,
        ingredient: {
          unitType: r.ingredient.unit_type,
          sugarGPerUnit: r.ingredient.sugar_g_per_unit,
          satFatGPerUnit: r.ingredient.saturated_fat_g_per_unit,
        },
      })),
    });
    expect(edge.total).toEqual(client.total);
    expect(edge.perServing).toEqual(client.perServing);
    // sanity on the golden values: sugar known (8×2.5=20), one unknown sat row;
    // sat known (3×1=3), one unknown sugar row.
    expect(client.total.sugarG).toEqual({ known: 20, missing: 1 });
    expect(client.total.satFatG).toEqual({ known: 3, missing: 1 });
  });
});

// ── Snake adapter: the ONLY snake_case boundary (DB write shape) ────────────

describe('R-17 — snake_case adapter (daily_nutrition_history write boundary)', () => {
  it('maps camelCase core Macros onto snake_case DB columns', () => {
    const { perServing } = clientComputeRecipeMacros({
      servings: 2,
      rows: toClientRows(RECIPES[0]),
    });
    expect(toSnakeMacros(perServing)).toEqual({
      kcal: perServing.kcal,
      protein_g: perServing.proteinG,
      carbs_g: perServing.carbsG,
      fat_g: perServing.fatG,
      fiber_g: perServing.fiberG,
    });
  });

  it('EMPTY_SNAKE is the zero row', () => {
    expect(EMPTY_SNAKE).toEqual({
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
    });
  });
});

// ── Date/TZ parity: client path === edge path ──────────────────────────────

describe('R-17 parity — date/TZ helpers (client vs edge)', () => {
  it('isoDateInTZ agrees across runtimes (incl. DST + explicit tz)', () => {
    const samples = [
      new Date('2026-05-17T22:30:00Z'),
      new Date('2026-01-15T23:30:00Z'),
      new Date('2026-07-01T00:00:00Z'),
    ];
    for (const d of samples) {
      expect(edgeIsoDateInTZ(d)).toBe(clientIsoDateInTZ(d));
      expect(edgeIsoDateInTZ(d, 'UTC')).toBe(clientIsoDateInTZ(d, 'UTC'));
    }
  });

  it('previousDayInTZ / mondayOfTodayInTZ agree across runtimes', () => {
    expect(edgePreviousDayInTZ()).toBe(clientPreviousDayInTZ());
    expect(edgeMondayOfTodayInTZ()).toBe(clientMondayOfTodayInTZ());
  });

  it('isoDateInTZ honours the DST offset boundary (Europe/Madrid)', () => {
    expect(edgeIsoDateInTZ(new Date('2026-05-17T22:30:00Z'))).toBe('2026-05-18');
    expect(edgeIsoDateInTZ(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
  });
});
