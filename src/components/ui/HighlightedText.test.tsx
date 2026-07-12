import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HighlightedText } from './HighlightedText';

function mark(): HTMLElement | null {
  return document.querySelector('mark');
}

describe('HighlightedText', () => {
  it('wraps the matched substring in a <mark>, leaving the rest as text', () => {
    render(
      <p data-testid="row">
        <HighlightedText text="Pollo pechuga" query="pech" />
      </p>,
    );

    expect(mark()).toHaveTextContent('pech');
    expect(screen.getByTestId('row')).toHaveTextContent('Pollo pechuga');
  });

  it('renders the plain string, with no <mark>, when nothing matches', () => {
    render(
      <p data-testid="row">
        <HighlightedText text="Pollo pechuga" query="avena" />
      </p>,
    );

    expect(mark()).toBeNull();
    expect(screen.getByTestId('row')).toHaveTextContent('Pollo pechuga');
  });

  it('renders the plain string for a blank query', () => {
    render(
      <p data-testid="row">
        <HighlightedText text="Pollo pechuga" query="" />
      </p>,
    );

    expect(mark()).toBeNull();
    expect(screen.getByTestId('row')).toHaveTextContent('Pollo pechuga');
  });

  it('survives a query full of regex metacharacters', () => {
    render(
      <p data-testid="row">
        <HighlightedText text="Aceite (virgen extra)" query="(virgen" />
      </p>,
    );

    expect(mark()).toHaveTextContent('(virgen');
  });

  it('highlights the accented original when the query is unaccented', () => {
    render(
      <p data-testid="row">
        <HighlightedText text="Jamón serrano" query="jamon" />
      </p>,
    );

    // The mark wraps "Jamón" — the ORIGINAL characters, not the folded "jamon".
    expect(mark()?.textContent).toBe('Jamón');
    expect(screen.getByTestId('row')).toHaveTextContent('Jamón serrano');
  });
});
