import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Echo i18n keys so element queries don't depend on i18n initialisation;
// the behaviour we assert (onChange payloads) keys off the muscle CODE, not the label.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { MuscleTagField, type MuscleTagValue } from './MuscleTagField';

function Harness({
  initial,
  onChange,
}: {
  initial: MuscleTagValue;
  onChange: (v: MuscleTagValue) => void;
}) {
  // MuscleTagField is controlled — feed onChange back into value so a sequence of
  // clicks advances state (a static value would re-read the same state each click).
  const [value, setValue] = useState<MuscleTagValue>(initial);
  return (
    <MuscleTagField
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

function setup(initial: MuscleTagValue = { primary: [], secondary: [] }) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  return { onChange };
}

describe('MuscleTagField tri-state', () => {
  it('cycles a pill neutral → primary → secondary → neutral', () => {
    const { onChange } = setup();
    const pill = screen.getByRole('button', { name: /exerciseDialog\.muscle\.pec_lower/ });
    fireEvent.click(pill); // → primary
    expect(onChange).toHaveBeenLastCalledWith({ primary: ['pec_lower'], secondary: [] });
    fireEvent.click(pill); // → secondary
    expect(onChange).toHaveBeenLastCalledWith({ primary: [], secondary: ['pec_lower'] });
    fireEvent.click(pill); // → neutral
    expect(onChange).toHaveBeenLastCalledWith({ primary: [], secondary: [] });
  });

  it('full_body checkbox is mutually exclusive with the grouped list', () => {
    const { onChange } = setup({ primary: ['pec_lower'], secondary: ['delt_front'] });
    fireEvent.click(screen.getByRole('checkbox', { name: /exerciseDialog\.muscle\.full_body/ }));
    expect(onChange).toHaveBeenLastCalledWith({ primary: ['full_body'], secondary: [] });
  });

  it('toggling full_body off clears back to an empty selection', () => {
    const { onChange } = setup({ primary: ['full_body'], secondary: [] });
    fireEvent.click(screen.getByRole('checkbox', { name: /exerciseDialog\.muscle\.full_body/ }));
    expect(onChange).toHaveBeenLastCalledWith({ primary: [], secondary: [] });
  });

  it('disables the grouped pills while full_body is active', () => {
    setup({ primary: ['full_body'], secondary: [] });
    expect(
      screen.getByRole('button', { name: /exerciseDialog\.muscle\.pec_lower/ }),
    ).toBeDisabled();
  });
});
