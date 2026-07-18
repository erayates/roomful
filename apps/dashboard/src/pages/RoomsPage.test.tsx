import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RoomsPage } from './RoomsPage';

describe('RoomsPage', () => {
  it('renders loading state', () => {
    const { container } = render(
      <RoomsPage projectId="proj-1" projectName="Test" onBack={() => {}} />,
    );
    expect(container.querySelector('[data-testid="loading"]')).toBeTruthy();
  });
});
