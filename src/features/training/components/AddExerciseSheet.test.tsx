import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true })); // desktop → Dialog

import { AddExerciseSheet, type AddExerciseRoutineOption } from './AddExerciseSheet';

const routines: AddExerciseRoutineOption[] = [
  { id: 'r-torso', name: 'Torso A', daysAhead: 0 },
  { id: 'r-pierna', name: 'Pierna', daysAhead: null },
];

function setup(over: Partial<Parameters<typeof AddExerciseSheet>[0]> = {}) {
  const onAddToRoutine = vi.fn();
  const onTrainNow = vi.fn();
  render(
    <AddExerciseSheet
      open
      onOpenChange={vi.fn()}
      exerciseName="Press de banca"
      routines={routines}
      onAddToRoutine={onAddToRoutine}
      onTrainNow={onTrainNow}
      {...over}
    />,
  );
  return { onAddToRoutine, onTrainNow };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('AddExerciseSheet', () => {
  it('adds to the first routine with the 3×8-12 defaults', () => {
    const { onAddToRoutine } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a la rutina' }));
    expect(onAddToRoutine).toHaveBeenCalledWith('r-torso', {
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
    });
  });

  it('labels the scheduled routine with when it comes up', () => {
    setup();
    expect(screen.getByRole('option', { name: 'Torso A · hoy' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pierna' })).toBeInTheDocument();
  });

  it('says out loud that adding to a routine is permanent', () => {
    setup();
    expect(screen.getByText(/de forma permanente/i)).toBeInTheDocument();
  });

  it('sends the edited targets to the chosen routine', () => {
    const { onAddToRoutine } = setup();
    fireEvent.change(screen.getByLabelText('Rutina'), { target: { value: 'r-pierna' } });
    fireEvent.change(screen.getByLabelText('Series'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Reps mín.'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Reps máx.'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a la rutina' }));
    expect(onAddToRoutine).toHaveBeenCalledWith('r-pierna', {
      target_sets: 5,
      target_reps_min: 3,
      target_reps_max: 5,
    });
  });

  it('blocks a rep range that runs backwards', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Reps mín.'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Reps máx.'), { target: { value: '8' } });
    expect(screen.getByRole('button', { name: 'Añadir a la rutina' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Entrenar ahora' })).toBeDisabled();
  });

  it('blocks zero sets', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Series'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Añadir a la rutina' })).toBeDisabled();
  });

  it('disables the routine button while a save is in flight', () => {
    setup({ isSaving: true });
    expect(screen.getByRole('button', { name: 'Añadir a la rutina' })).toBeDisabled();
  });

  it('trains now with the same targets, no routine involved', () => {
    const { onTrainNow, onAddToRoutine } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Entrenar ahora' }));
    expect(onTrainNow).toHaveBeenCalledWith({
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
    });
    expect(onAddToRoutine).not.toHaveBeenCalled();
  });

  it('with no routines, offers only the one-off session', () => {
    setup({ routines: [] });
    expect(screen.queryByRole('button', { name: 'Añadir a la rutina' })).not.toBeInTheDocument();
    expect(screen.getByText(/Todavía no tienes rutinas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrenar ahora' })).toBeEnabled();
  });

  it('translates to English', async () => {
    await i18n.changeLanguage('en');
    setup();
    expect(screen.getByRole('button', { name: 'Add to routine' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Torso A · today' })).toBeInTheDocument();
  });
});
