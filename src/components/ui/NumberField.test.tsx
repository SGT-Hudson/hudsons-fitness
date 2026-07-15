// @vitest-environment jsdom
//
// Tier-2 contract test for the shared decimal input.
//
// The `type="text"` assertion is the load-bearing one of the whole
// decimal-comma fix: `type="number"` strips a typed comma before JS sees it,
// so flipping this element back to `type="number"` would silently re-break
// every field built on it. jsdom cannot observe that stripping (it does not
// implement the sanitization), so asserting the ATTRIBUTE is the only guard a
// unit test can offer. The behavioural proof lives in a real browser.
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('renders type="text" inputMode="decimal" — NOT type="number"', () => {
    render(<NumberField id="f" label="Peso" />);
    const input = screen.getByLabelText('Peso');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });

  it('hardcodes no native min/max/step gate — bounds are the schema\'s job now', () => {
    render(<NumberField id="f" label="Peso" />);
    const input = screen.getByLabelText('Peso');
    expect(input).not.toHaveAttribute('min');
    expect(input).not.toHaveAttribute('max');
    expect(input).not.toHaveAttribute('step');
  });

  it('forwards the ref (react-hook-form register() needs the DOM node)', () => {
    const ref = createRef<HTMLInputElement>();
    render(<NumberField id="f" label="Peso" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.id).toBe('f');
  });

  it('forwards input props and change events (the register() spread)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField id="f" label="Peso" name="weight_kg" onChange={onChange} />);

    const input = screen.getByLabelText('Peso') as HTMLInputElement;
    expect(input).toHaveAttribute('name', 'weight_kg');

    await user.type(input, '82,4');
    expect(onChange).toHaveBeenCalled();
    // The comma reaches the value as typed — no separator is silently dropped.
    expect(input.value).toBe('82,4');
  });

  it('renders the unit suffix', () => {
    render(<NumberField id="f" label="Proteínas" suffix="g" />);
    expect(screen.getByText('g')).toBeInTheDocument();
  });

  it('labels the input even when the call site renders its own <Label>', () => {
    render(
      <>
        <label htmlFor="f">Peso inicial</label>
        <NumberField id="f" />
      </>,
    );
    expect(screen.getByLabelText('Peso inicial')).toHaveAttribute('type', 'text');
  });
});
