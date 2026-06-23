import { describe, expect, it } from 'vitest';

import { findMiniApp, MINI_APPS } from './registry';

describe('mini-app registry', () => {
  it('exposes the playground apps in order', () => {
    expect(MINI_APPS.map((app) => app.id)).toEqual([
      'canvas',
      'cursors',
      'chat',
      'reactions',
      'mood',
      'notes',
      'checklist',
      'poll',
    ]);
  });

  it('every app declares a title, tagline, and primitives badge', () => {
    for (const app of MINI_APPS) {
      expect(app.title.length).toBeGreaterThan(0);
      expect(app.tagline.length).toBeGreaterThan(0);
      expect(app.primitives.length).toBeGreaterThan(0);
    }
  });

  it('resolves a known app and falls back to canvas for unknown or missing ids', () => {
    expect(findMiniApp('poll').id).toBe('poll');
    expect(findMiniApp('does-not-exist').id).toBe('canvas');
    expect(findMiniApp(null).id).toBe('canvas');
  });
});
