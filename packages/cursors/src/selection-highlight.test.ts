// @vitest-environment jsdom

import type { Peer, PresenceData } from '@flockjs/core';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectionHighlight } from './index';

function createPeer(id: string, overrides: Partial<Peer<PresenceData>> = {}): Peer<PresenceData> {
  return {
    id,
    joinedAt: 1,
    lastSeen: 1,
    name: id,
    ...overrides,
  };
}

let originalCSS: unknown;
let originalHighlight: unknown;

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  originalCSS = Reflect.get(globalThis, 'CSS');
  originalHighlight = Reflect.get(globalThis, 'Highlight');
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  if (originalCSS === undefined) {
    Reflect.deleteProperty(globalThis, 'CSS');
  } else {
    Reflect.set(globalThis, 'CSS', originalCSS);
  }

  if (originalHighlight === undefined) {
    Reflect.deleteProperty(globalThis, 'Highlight');
  } else {
    Reflect.set(globalThis, 'Highlight', originalHighlight);
  }
});

describe('SelectionHighlight', () => {
  it('falls back to span injection and restores the original DOM on unmount', () => {
    document.body.innerHTML = '<p id="editor">Ada <strong>Lovelace</strong> writes tests</p>';

    const { unmount } = render(
      createElement(SelectionHighlight, {
        peer: createPeer('peer-a', {
          color: '#cc3366',
          name: 'Ada',
        }),
        selection: {
          elementId: 'editor',
          from: 2,
          to: 12,
        },
      }),
    );

    const highlights = Array.from(
      document.querySelectorAll('[data-flockjs-selection-highlight="true"]'),
    );

    expect(highlights).toHaveLength(2);
    expect(highlights.map((highlight) => highlight.textContent)).toEqual(['a ', 'Lovelace']);
    expect(highlights[0]?.getAttribute('data-flockjs-selection-highlight-peer')).toBe('peer-a');
    expect(document.getElementById('editor')?.textContent).toBe('Ada Lovelace writes tests');

    unmount();

    expect(document.querySelector('[data-flockjs-selection-highlight="true"]')).toBeNull();
    expect(document.getElementById('editor')?.innerHTML).toBe(
      'Ada <strong>Lovelace</strong> writes tests',
    );
  });

  it('uses the CSS custom highlight API when available and cleans up injected styles', () => {
    document.body.innerHTML = '<p id="editor">Ada Lovelace</p>';
    const highlightRegistry = {
      delete: vi.fn<(name: string) => void>(),
      set: vi.fn<(name: string, highlight: unknown) => void>(),
    };

    class HighlightMock {
      public readonly ranges: Range[];

      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }

    Reflect.set(globalThis, 'CSS', {
      highlights: highlightRegistry,
    });
    Reflect.set(globalThis, 'Highlight', HighlightMock);

    const { unmount } = render(
      createElement(SelectionHighlight, {
        peer: createPeer('peer-b', {
          color: '#2255aa',
          name: 'Bob',
        }),
        selection: {
          elementId: 'editor',
          from: 0,
          to: 3,
        },
      }),
    );

    expect(highlightRegistry.set).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-flockjs-selection-highlight="true"]')).toBeNull();

    const [highlightName, highlight] = highlightRegistry.set.mock.calls[0] ?? [];
    const styleElement = document.head.querySelector(
      `[data-flockjs-selection-highlight-style="${highlightName}"]`,
    );

    expect(String(highlightName)).toContain('flockjs-selection');
    expect(highlight).toBeInstanceOf(HighlightMock);
    expect(styleElement).not.toBeNull();
    expect(styleElement?.textContent).toContain(`::highlight(${String(highlightName)})`);

    unmount();

    expect(highlightRegistry.delete).toHaveBeenCalledWith(highlightName);
    expect(
      document.head.querySelector(`[data-flockjs-selection-highlight-style="${highlightName}"]`),
    ).toBeNull();
  });
});
