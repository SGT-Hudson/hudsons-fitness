import { describe, expect, it, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExerciseImageLoop } from './ExerciseImageLoop';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('ExerciseImageLoop', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(
      <ExerciseImageLoop images={[]} name="Bench press" density="compact" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single static frame when there is one image', () => {
    render(
      <ExerciseImageLoop images={['Bench_Press/0.jpg']} name="Bench press" density="compact" />,
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('alt', 'Bench press — start position');
    expect(imgs[0]).toHaveAttribute('loading', 'lazy');
  });

  it('renders start + end frames when there are two images', () => {
    render(
      <ExerciseImageLoop
        images={['Bench_Press/0.jpg', 'Bench_Press/1.jpg']}
        name="Bench press"
        density="compact"
      />,
    );
    expect(screen.getByAltText('Bench press — start position')).toBeInTheDocument();
    expect(screen.getByAltText('Bench press — end position')).toBeInTheDocument();
  });

  it('applies the loop animation class to the end frame only', () => {
    render(
      <ExerciseImageLoop
        images={['Bench_Press/0.jpg', 'Bench_Press/1.jpg']}
        name="Bench press"
        density="compact"
      />,
    );
    const start = screen.getByAltText('Bench press — start position');
    const end = screen.getByAltText('Bench press — end position');
    expect(end).toHaveClass('motion-safe:animate-exercise-frame');
    expect(start).not.toHaveClass('motion-safe:animate-exercise-frame');
  });

  it('opens the enlarge dialog on tap', () => {
    render(
      <ExerciseImageLoop images={['Bench_Press/0.jpg']} name="Bench press" density="compact" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge image' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
