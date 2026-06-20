// @vitest-environment node

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PeerCursor } from './index';

describe('PeerCursor SSR', () => {
  it('renders to a string without touching browser-only globals', () => {
    const html = renderToString(
      createElement(PeerCursor, {
        x: 0.5,
        y: 0.5,
        name: 'Grace',
        color: '#654321',
        idle: false,
        style: 'pointer',
      }),
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Grace');
    expect(html).toContain('data-cahoots-peer-cursor-style="pointer"');
  });
});
