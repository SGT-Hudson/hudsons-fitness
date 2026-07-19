import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { RecipeStepsField } from './RecipeStepsField';

// jsdom's language-detector defaults to English; the app's default (and the
// locale the /paso|subir|bajar/ assertions below target) is Spanish.
beforeEach(async () => {
  await i18n.changeLanguage('es');
});

function Harness({ steps }: { steps: Array<{ stepId: string; text: string }> }) {
  const methods = useForm({ defaultValues: { steps } });
  return (
    <FormProvider {...methods}>
      <RecipeStepsField />
    </FormProvider>
  );
}

const twoSteps = [
  { stepId: 's1', text: 'primero' },
  { stepId: 's2', text: 'segundo' },
];

describe('RecipeStepsField', () => {
  it('renders one textarea per step, numbered in order', () => {
    render(<Harness steps={twoSteps} />);
    const areas = screen.getAllByRole('textbox');
    expect(areas).toHaveLength(2);
    expect((areas[0] as HTMLTextAreaElement).value).toBe('primero');
    expect((areas[1] as HTMLTextAreaElement).value).toBe('segundo');
  });

  it('adds an empty step', async () => {
    render(<Harness steps={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /paso/i }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('moves a step down, swapping it with its neighbour', async () => {
    render(<Harness steps={twoSteps} />);
    await userEvent.click(screen.getAllByRole('button', { name: /bajar|move down/i })[0]);
    const areas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    expect(areas[0].value).toBe('segundo');
    expect(areas[1].value).toBe('primero');
  });

  it('disables up on the first step and down on the last', () => {
    render(<Harness steps={twoSteps} />);
    const ups = screen.getAllByRole('button', { name: /subir|move up/i });
    const downs = screen.getAllByRole('button', { name: /bajar|move down/i });
    expect(ups[0]).toBeDisabled();
    expect(downs[downs.length - 1]).toBeDisabled();
  });

  it('removes a step', async () => {
    render(<Harness steps={twoSteps} />);
    await userEvent.click(screen.getAllByRole('button', { name: /eliminar|remove/i })[0]);
    const areas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    expect(areas).toHaveLength(1);
    expect(areas[0].value).toBe('segundo');
  });
});
