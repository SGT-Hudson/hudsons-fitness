import i18n from '@/i18n';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecipePeek } from './RecipePeek';

// RecipePeek pulls `ingredientDisplayName` from `@/features/ingredients/api`,
// which imports the Supabase client module-scope — that throws in a jsdom
// test run with no VITE_SUPABASE_* env (see AddToDaySheet.test.tsx for the
// same mock).
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const recipe = {
  id: 'r1',
  name: 'Lentejas estofadas',
  servings: 4,
  instructions: 'Sofríe la verdura. Añade las lentejas. Cuece 30 min.',
  recipe_ingredients: [
    {
      id: 'ri1', recipe_id: 'r1', ingredient_id: 'i1', quantity: 400, per_serving: false,
      display_order: 0, created_at: '',
      ingredient: {
        id: 'i1', name: 'Lentejas', brand: null, unit_type: 'g',
        kcal_per_unit: 1.16, protein_g_per_unit: 0.09, carbs_g_per_unit: 0.2,
        fat_g_per_unit: 0.01, fiber_g_per_unit: 0.08,
      },
    },
  ],
};

let recipeQuery: { data: unknown; isLoading: boolean } = { data: recipe, isLoading: false };

vi.mock('@/features/recipes/hooks', () => ({
  useRecipe: () => recipeQuery,
}));

beforeEach(() => {
  recipeQuery = { data: recipe, isLoading: false };
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

function renderPeek() {
  return render(
    <MemoryRouter>
      <RecipePeek open onOpenChange={() => {}} recipeId="r1" contextLabel="Comida · Jue 30" servings={2} />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('RecipePeek', () => {
  it('shows the recipe, its plan context and its ingredients', () => {
    renderPeek();
    expect(screen.getByText('Lentejas estofadas')).toBeInTheDocument();
    expect(screen.getByText('Comida · Jue 30')).toBeInTheDocument();
    // The recipe name itself contains "Lentejas" as a substring, so the title
    // and the ingredient row both legitimately match this regex — assert
    // presence via getAllByText rather than the single-match getByText.
    expect(screen.getAllByText(/Lentejas/).length).toBeGreaterThan(0);
    expect(screen.getByText(/400/)).toBeInTheDocument();
  });

  it('shows the instructions when the recipe has them', () => {
    renderPeek();
    expect(screen.getByText(/Sofríe la verdura/)).toBeInTheDocument();
  });

  it('omits the instructions block when the recipe has none', () => {
    recipeQuery = { data: { ...recipe, instructions: null }, isLoading: false };
    renderPeek();
    expect(screen.queryByText(/Sofríe la verdura/)).toBeNull();
  });

  it('links out to the full recipe', () => {
    renderPeek();
    expect(screen.getByRole('link', { name: /abrir receta/i })).toHaveAttribute('href', '/recipes/r1');
  });

  it('shows a loading state while the recipe is in flight', () => {
    recipeQuery = { data: undefined, isLoading: true };
    // ResponsiveDialog's desktop branch renders via a Radix Portal straight to
    // `document.body` — outside RTL's own `container` div — so the skeleton
    // has to be looked up on the document, not the render container.
    renderPeek();
    expect(document.body.querySelector('[data-slot="skeleton"], .animate-pulse')).not.toBeNull();
  });

  it('shows a failure message — not endless skeletons — when the fetch settles with no recipe', () => {
    recipeQuery = { data: undefined, isLoading: false };
    renderPeek();
    expect(screen.getByText('No se pudo cargar la receta.')).toBeInTheDocument();
    expect(document.body.querySelector('[data-slot="skeleton"], .animate-pulse')).toBeNull();
  });

  // R-33 wave 3 QA fix: `peek.servings`/`peek.planned` used a single
  // `{{count}}` string for every count — now i18next _one/_other forms.
  it('uses the singular form for the recipe yield (4 servings — plural) and the planned badge (1 — singular)', () => {
    renderPeek(); // recipe.servings = 4, planned `servings` prop = 2
    expect(screen.getByText('4 raciones')).toBeInTheDocument();
    expect(screen.getByText('Planificado: 2 raciones')).toBeInTheDocument();
  });

  it('uses the singular form when both the recipe yield and the planned amount are 1', () => {
    recipeQuery = { data: { ...recipe, servings: 1 }, isLoading: false };
    render(
      <MemoryRouter>
        <RecipePeek open onOpenChange={() => {}} recipeId="r1" contextLabel="Comida · Jue 30" servings={1} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1 ración')).toBeInTheDocument();
    expect(screen.getByText('Planificado: 1 ración')).toBeInTheDocument();
  });
});
