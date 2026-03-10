import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

beforeAll(() => {
  class ResizeObserverMock {
    public observe = vi.fn();
    public unobserve = vi.fn();
    public disconnect = vi.fn();
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return {
        bottom: 620,
        height: 620,
        left: 0,
        right: 960,
        top: 0,
        width: 960,
        x: 0,
        y: 0,
        toJSON() {
          return undefined;
        },
      };
    },
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value() {
      return {
        arc: vi.fn(),
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        fill: vi.fn(),
        lineCap: 'round',
        lineJoin: 'round',
        lineTo: vi.fn(),
        lineWidth: 1,
        moveTo: vi.fn(),
        setTransform: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '#000000',
        globalAlpha: 1,
      };
    },
  });
});
