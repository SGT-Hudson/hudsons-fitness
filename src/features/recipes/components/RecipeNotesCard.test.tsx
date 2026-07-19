import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { RecipeNotesCard } from './RecipeNotesCard';

// jsdom's language-detector defaults to English; the app's default (and the
// locale the 'Guardado' assertion below targets) is Spanish.
beforeEach(async () => {
  await i18n.changeLanguage('es');
});

const saveNote = vi.fn();
let noteState = { exists: true, note: 'menos sal' };
let mutationIsPending = false;

vi.mock('../hooks', () => ({
  useRecipeNote: () => ({ data: noteState, isLoading: false }),
  useSaveRecipeNote: () => ({ mutate: saveNote, isPending: mutationIsPending }),
}));

describe('RecipeNotesCard', () => {
  it('shows the stored note', () => {
    noteState = { exists: true, note: 'menos sal' };
    render(<RecipeNotesCard recipeId="r1" />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('menos sal');
  });

  it('renders nothing when the recipe is not in the user library', () => {
    noteState = { exists: false, note: '' };
    const { container } = render(<RecipeNotesCard recipeId="r1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('saves on blur when the text changed', async () => {
    noteState = { exists: true, note: 'menos sal' };
    saveNote.mockClear();
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    await userEvent.tab();
    expect(saveNote.mock.calls[0][0]).toEqual({ recipeId: 'r1', note: 'mas pimienta' });
  });

  it('does not save on blur when the text is unchanged', async () => {
    noteState = { exists: true, note: 'menos sal' };
    saveNote.mockClear();
    render(<RecipeNotesCard recipeId="r1" />);
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.tab();
    expect(saveNote).not.toHaveBeenCalled();
  });

  it('shows the saved indicator once the mutation actually succeeds', async () => {
    noteState = { exists: true, note: 'menos sal' };
    mutationIsPending = false;
    saveNote.mockClear();
    saveNote.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    await userEvent.tab();
    expect(screen.getByText('Guardado')).toBeInTheDocument();
  });

  it('does not show the saved indicator when the save rejects', async () => {
    noteState = { exists: true, note: 'menos sal' };
    mutationIsPending = false;
    saveNote.mockClear();
    // Mirrors the real hook's onError toast path: the mutation settles
    // without ever invoking onSuccess.
    saveNote.mockImplementation(() => {});
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    await userEvent.tab();
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('does not overwrite an in-progress draft when a refetch lands while the field is focused', async () => {
    noteState = { exists: true, note: 'menos sal' };
    saveNote.mockClear();
    const { rerender } = render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.click(area);
    await userEvent.type(area, ' y mas ajo');

    // Simulate the post-save invalidation refetch landing while the user is
    // still focused on (and typing in) the field.
    noteState = { exists: true, note: 'un valor distinto del servidor' };
    rerender(<RecipeNotesCard recipeId="r1" />);

    expect((area as HTMLTextAreaElement).value).toBe('menos sal y mas ajo');
  });

  it('reseeds the draft when a refetch lands while the field is not focused', () => {
    noteState = { exists: true, note: 'menos sal' };
    const { rerender } = render(<RecipeNotesCard recipeId="r1" />);

    noteState = { exists: true, note: 'actualizado desde el servidor' };
    rerender(<RecipeNotesCard recipeId="r1" />);

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'actualizado desde el servidor',
    );
  });
});
