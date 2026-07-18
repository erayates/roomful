import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectsPage } from './ProjectsPage';

describe('ProjectsPage', () => {
  it('renders loading state', () => {
    const { container } = render(<ProjectsPage onSelectProject={() => {}} />);
    expect(container.querySelector('[data-testid="loading"]')).toBeTruthy();
  });
});
