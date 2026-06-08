import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Drawer, DrawerContent, DrawerTitle } from './drawer';

describe('Drawer', () => {
  it('renders its content + title when open', () => {
    render(
      <Drawer open>
        <DrawerContent>
          <DrawerTitle>Sheet title</DrawerTitle>
          <p>Body content</p>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.getByText('Sheet title')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });
});
