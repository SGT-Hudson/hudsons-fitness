import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompositionCard } from './CompositionCard';

// Two points 7 days apart → `compositionDelta` reads its full lookback window.
const older = {
  id: 'm0',
  measured_on: '2026-05-11',
  weight_kg: 79.4,
  body_fat_pct: 18.4,
  muscle_pct: 40.9,
  water_pct: 55.3,
  notes: null,
} as never;

const latest = {
  id: 'm1',
  measured_on: '2026-05-18',
  weight_kg: 78.4,
  body_fat_pct: 18.2,
  muscle_pct: 41.1,
  water_pct: 55.3,
  notes: null,
} as never;

const recent = [latest, older];

describe('CompositionCard', () => {
  it('renders the three tiles with their values', () => {
    render(<CompositionCard latest={latest} recent={recent} phaseType="cut" />);
    expect(screen.getByTestId('comp-tile-bodyFat')).toHaveTextContent('18.2');
    expect(screen.getByTestId('comp-tile-muscle')).toHaveTextContent('41.1');
    expect(screen.getByTestId('comp-tile-water')).toHaveTextContent('55.3');
  });

  it('renders the 7-day deltas from trend.ts, phase-toned', () => {
    render(<CompositionCard latest={latest} recent={recent} phaseType="cut" />);

    // Fat down in a cut → good; muscle up → good; water flat → neutral.
    const fat = screen.getByTestId('comp-delta-bodyFat');
    expect(fat).toHaveTextContent('↓ 0.2');
    expect(fat).toHaveClass('text-tone-good');

    const muscle = screen.getByTestId('comp-delta-muscle');
    expect(muscle).toHaveTextContent('↑ 0.2');
    expect(muscle).toHaveClass('text-tone-good');

    const water = screen.getByTestId('comp-delta-water');
    expect(water).toHaveTextContent('· 0.0');
    expect(water).toHaveClass('text-text-dim');
  });

  it('tones a fat gain in a cut as bad', () => {
    const gainedOlder = { ...(older as object), body_fat_pct: 18.0 } as never;
    render(
      <CompositionCard
        latest={latest}
        recent={[latest, gainedOlder]}
        phaseType="cut"
      />,
    );
    const fat = screen.getByTestId('comp-delta-bodyFat');
    expect(fat).toHaveTextContent('↑ 0.2');
    expect(fat).toHaveClass('text-destructive');
  });

  it('omits deltas when there is a single measurement', () => {
    render(<CompositionCard latest={latest} recent={[latest]} phaseType="cut" />);
    expect(screen.queryByTestId('comp-delta-bodyFat')).toBeNull();
    expect(screen.getByTestId('comp-tile-bodyFat')).toHaveTextContent('18.2');
  });

  it('fires onExpand when a tile is tapped', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    render(
      <CompositionCard
        latest={latest}
        recent={recent}
        phaseType="cut"
        onExpand={onExpand}
      />,
    );
    await user.click(screen.getByTestId('comp-tile-muscle'));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when no composition value is logged', () => {
    const bare = { ...(latest as object), body_fat_pct: null, muscle_pct: null, water_pct: null } as never;
    render(<CompositionCard latest={bare} recent={[bare]} />);
    expect(screen.queryByTestId('comp-tile-bodyFat')).toBeNull();
  });
});
