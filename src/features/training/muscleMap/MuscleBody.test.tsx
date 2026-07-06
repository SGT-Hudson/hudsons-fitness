import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MuscleBody } from './MuscleBody';

describe('MuscleBody fine→slug aggregation', () => {
  it('sums the fine codes that share an art region (3 delts → deltoids)', () => {
    const intensity = { delt_front: 1, delt_side: 0.5, delt_rear: 0.5 } as Record<string, number>;
    const { container } = render(
      <MuscleBody intensityByMuscle={intensity} max={2} gender="male" side="front" />,
    );
    const fills = [...container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    // deltoids sums to 2.0 === max → the max-intensity colour (co-shading the 3 delts).
    expect(fills).toContain('color-mix(in oklab, var(--gym) 100%, var(--heat-zero))'); // muscleColor(2,2)
    // and a region with zero volume (e.g. chest/quads) stays the zero-data tint,
    // proving the aggregation discriminates rather than colouring everything.
    expect(fills).toContain('var(--heat-zero)'); // muscleColor(0,2)
  });
});
