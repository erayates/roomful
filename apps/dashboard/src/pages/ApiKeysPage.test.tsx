import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiKeysPage } from './ApiKeysPage';

describe('ApiKeysPage', () => {
  it('renders loading state', () => {
    const { container } = render(<ApiKeysPage />);
    expect(container.querySelector('[data-testid="loading"]')).toBeTruthy();
  });
});
