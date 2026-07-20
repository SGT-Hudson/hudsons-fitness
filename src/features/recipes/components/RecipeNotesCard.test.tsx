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

const saveButton = () => screen.getByRole('button', { name: 'Guardar' });

describe('RecipeNotesCard', () => {
  beforeEach(() => {
    saveNote.mockReset();
    saveNote.mockImplementation(() => {});
    mutationIsPending = false;
  });

  it('shows the stored note', () => {
    noteState = { exists: true, note: 'menos sal' };
    render(<RecipeNotesCard recipeId="r1" />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('menos sal');
  });

  it('renders nothing when the recipe is not in the user library', () => {
    noteState = { exists: false, note: '' };
    const { container } = render(<RecipeNotesCard recipeId="r1" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // Blur-save was removed deliberately (spec 2026-07-20): the note now writes
  // like every other field in the app, through an explicit button. This test
  // exists so it does not get reintroduced by reflex.
  it('does not save on blur', async () => {
    noteState = { exists: true, note: 'menos sal' };
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    await userEvent.tab();
    expect(saveNote).not.toHaveBeenCalled();
  });

  it('disables the button when the draft matches the stored note', () => {
    noteState = { exists: true, note: 'menos sal' };
    render(<RecipeNotesCard recipeId="r1" />);
    expect(saveButton()).toBeDisabled();
  });

  // Pins the comparison to .trim() on BOTH sides. A naive `draft !== data.note`
  // passes every other test in this file and fails only this one.
  it('disables the button when the only difference is surrounding whitespace', async () => {
    noteState = { exists: true, note: 'menos sal' };
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, '  menos sal  ');
    expect(saveButton()).toBeDisabled();
  });

  it('enables the button and saves the draft when the text changed', async () => {
    noteState = { exists: true, note: 'menos sal' };
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    expect(saveButton()).toBeEnabled();
    await userEvent.click(saveButton());
    expect(saveNote.mock.calls[0][0]).toEqual({ recipeId: 'r1', note: 'mas pimienta' });
  });

  it('shows the unsaved marker while the draft differs, and drops it once saved', async () => {
    noteState = { exists: true, note: 'menos sal' };
    saveNote.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    expect(screen.getByText('Sin guardar')).toBeInTheDocument();

    // The save resolves and the server now holds what was typed, exactly as the
    // invalidation refetch would deliver it.
    noteState = { exists: true, note: 'mas pimienta' };
    await userEvent.click(saveButton());

    expect(screen.queryByText('Sin guardar')).not.toBeInTheDocument();
    expect(screen.getByText('Guardado')).toBeInTheDocument();
  });

  it('shows the saved indicator once the mutation actually succeeds', async () => {
    noteState = { exists: true, note: 'menos sal' };
    saveNote.mockImplementation((_payload, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    noteState = { exists: true, note: 'mas pimienta' };
    await userEvent.click(saveButton());
    expect(screen.getByText('Guardado')).toBeInTheDocument();
  });

  it('does not show the saved indicator when the save rejects', async () => {
    noteState = { exists: true, note: 'menos sal' };
    // Mirrors the real hook's onError toast path: the mutation settles
    // without ever invoking onSuccess.
    saveNote.mockImplementation(() => {});
    render(<RecipeNotesCard recipeId="r1" />);
    const area = screen.getByRole('textbox');
    await userEvent.clear(area);
    await userEvent.type(area, 'mas pimienta');
    await userEvent.click(saveButton());
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('does not overwrite an in-progress draft when a refetch lands while the field is focused', async () => {
    noteState = { exists: true, note: 'menos sal' };
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
