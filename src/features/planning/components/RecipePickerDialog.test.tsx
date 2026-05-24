import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipePickerDialog } from './RecipePickerDialog';

// Stub the recipe data hook so importing the dialog doesn't pull in the real
// Supabase client (which throws without env vars in the test env).
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('RecipePickerDialog — form isolation', () => {
  // Regression: the picker is portaled but stays in the React tree, so a submit
  // inside it (Enter in the search field, or the Save button) used to bubble to
  // the template editor's ancestor <form>, saving stale state + navigating away.
  it('does not submit an ancestor form when its own form submits', () => {
    const outerSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithClient(
      <form onSubmit={outerSubmit} aria-label="page-form">
        <RecipePickerDialog open onOpenChange={() => {}} onSave={() => {}} />
      </form>,
    );

    const dialogForm = document.querySelector('form.space-y-4') as HTMLFormElement | null;
    expect(dialogForm).not.toBeNull();

    fireEvent.submit(dialogForm!);

    expect(outerSubmit).not.toHaveBeenCalled();
  });
});
