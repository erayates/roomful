// @vitest-environment node

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FloatingReaction } from './index';

describe('FloatingReaction SSR', () => {
  it('renders markup and styles without browser globals', () => {
    const html = renderToString(
      createElement(FloatingReaction, {
        emoji: '🎉',
        x: 0.3,
        y: 0.5,
      }),
    );

    expect(html).toContain('data-roomful-floating-reaction="true"');
    expect(html).toContain('🎉');
    expect(html).toContain('roomful-floating-reaction-float');
    expect(html).toContain('@keyframes');
  });
});
