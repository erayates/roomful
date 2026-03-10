import {
  appendPointToStroke,
  createPoint,
  createStroke,
  EMPTY_CANVAS_STATE,
  finalizeStroke,
  upsertStroke,
} from './demo-strokes';
import type { DemoStroke } from './demo-types';

describe('demo-strokes', () => {
  it('deduplicates tiny point hops', () => {
    const stroke = appendPointToStroke(createStroke('peer-1', '#ff6b35', 1), createPoint(0.2, 0.2));

    expect(appendPointToStroke(stroke, createPoint(0.2005, 0.2005))).toBe(stroke);
  });

  it('duplicates a single point on finalize so taps render visibly', () => {
    const stroke = appendPointToStroke(createStroke('peer-1', '#ff6b35', 1), createPoint(0.2, 0.2));

    expect(finalizeStroke(stroke)?.points).toEqual([createPoint(0.2, 0.2), createPoint(0.2, 0.2)]);
  });

  it('replaces an existing stroke by id during upsert', () => {
    const original: DemoStroke = {
      color: '#ff6b35',
      createdAt: 1,
      id: 'stroke-1',
      peerId: 'peer-1',
      points: [createPoint(0.1, 0.1)],
      size: 0.006,
    };
    const replacement: DemoStroke = {
      ...original,
      points: [createPoint(0.2, 0.2), createPoint(0.3, 0.3)],
    };

    expect(upsertStroke(upsertStroke(EMPTY_CANVAS_STATE, original), replacement).strokes).toEqual([
      replacement,
    ]);
  });
});
