import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { MuscleCode } from '@/core/muscleVolume';
import { MuscleBody } from './MuscleBody';

vi.mock('./skins/mitSkin', () => ({
  ACTIVE_SKIN: {
    id: 'test',
    viewBox: () => '0 0 10 10',
    parts: () => [
      { slug: 'chest', paths: ['M0 0h1v1h-1z'] },
      { slug: 'calves', paths: ['M2 2h1v1h-1z'] },
      { slug: 'head', paths: ['M4 4h1v1h-1z'] },
    ],
    slugToMuscle: { chest: 'chest', calves: 'calves' },
  },
}));

describe('MuscleBody', () => {
  it('shades by intensity; non-muscle parts use the neutral fill', () => {
    const intensity = { chest: 10, calves: 0 } as unknown as Record<MuscleCode, number>;
    const { container } = render(
      <MuscleBody intensityByMuscle={intensity} max={10} gender="male" side="front" />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    // chest is the max → red-dominant rgb
    expect(paths[0].getAttribute('fill')).toMatch(/rgb\(2\d\d,\s?3\d,\s?3\d\)/);
    // head is unmapped → neutral part colour
    expect(paths[2].getAttribute('fill')).toBe('#e3e5e9');
  });
});
