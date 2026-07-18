import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecipeNotesCard } from './RecipeNotesCard';

const saveNote = vi.fn();
let noteState = { exists: true, note: 'menos sal' };

vi.mock('../hooks', () => ({
  useRecipeNote: () => ({ data: noteState, isLoading: false }),
  useSaveRecipeNote: () => ({ mutate: saveNote, isPending: false }),
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
    expect(saveNote).toHaveBeenCalledWith({ recipeId: 'r1', note: 'mas pimienta' });
  });

  it('does not save on blur when the text is unchanged', async () => {
    noteState = { exists: true, note: 'menos sal' };
    saveNote.mockClear();
    render(<RecipeNotesCard recipeId="r1" />);
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.tab();
    expect(saveNote).not.toHaveBeenCalled();
  });
});
