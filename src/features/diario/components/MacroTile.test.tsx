import '@/i18n';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MacroTile } from './MacroTile';

describe('MacroTile', () => {
  it('protein 20% under target: destructive value color + "faltan/short" caption', () => {
    const { container, getByText } = render(
      <MacroTile metric="protein" consumed={160} target={200} unit="g" phase="cut" />,
    );
    const value = container.querySelector('[data-macro="protein"] .text-destructive');
    expect(value).not.toBeNull();
    expect(getByText(/faltan 40 g|40 g short/i)).toBeInTheDocument();
  });

  it('carbs over target: renders the excess bar segment', () => {
    const { container } = render(
      <MacroTile metric="carbs" consumed={220} target={200} unit="g" phase="maintenance" />,
    );
    const excess = container.querySelector('[data-macro="carbs"] [data-excess]');
    expect(excess).not.toBeNull();
  });

  it('fat below its essential floor: tone-tinted (destructive) border on the tile', () => {
    const { container } = render(
      <MacroTile metric="fat" consumed={10} target={60} unit="g" floorG={48} phase="cut" />,
    );
    const tile = container.querySelector('[data-macro="fat"]');
    expect(tile?.className).toMatch(/border-destructive/);
  });

  it('good tone, under target with no penalty: dim "margin" caption, not tone-colored', () => {
    // fiber 28/30 = 93.3% → good (>= 90% threshold).
    const { container, getByText } = render(
      <MacroTile metric="fiber" consumed={28} target={30} unit="g" phase="cut" />,
    );
    expect(getByText(/2 g de margen|2 g to spare/i)).toBeInTheDocument();
    const caption = container.querySelector('[data-macro="fiber"] [data-caption]');
    expect(caption?.className).toMatch(/text-text-dim/);
    expect(caption?.className).not.toMatch(/text-tone-good/);
  });

  it('exact match: "on target" caption', () => {
    const { getByText } = render(
      <MacroTile metric="carbs" consumed={200} target={200} unit="g" phase="cut" />,
    );
    expect(getByText(/justo en el objetivo|right on target/i)).toBeInTheDocument();
  });

  it('over target (direction), regardless of tone: "+n g over" caption', () => {
    // protein 175/165, still tone 'good' (within -3%..+∞ good band per the tone core),
    // but consumed > target so the over-direction caption wins.
    const { getByText, container } = render(
      <MacroTile metric="protein" consumed={175} target={165} unit="g" phase="cut" />,
    );
    expect(getByText(/\+10 g sobre el objetivo|\+10 g over target/i)).toBeInTheDocument();
    const value = container.querySelector('[data-macro="protein"] .text-tone-good');
    expect(value).not.toBeNull();
  });

  it('no target: shows the consumed number, no bar, no caption', () => {
    const { container, queryByText } = render(
      <MacroTile metric="protein" consumed={80} unit="g" phase="cut" />,
    );
    expect(container.querySelector('[data-macro="protein"] [data-seg]')).toBeNull();
    expect(queryByText(/faltan|short|margen|spare|objetivo|target/i)).toBeNull();
  });
});
