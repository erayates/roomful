import type { PresenceData } from '@flockjs/core';
import { useEffect, useId } from 'react';

import { resolvePeerColor } from './presence-utils';
import type { SelectionHighlightProps, SelectionRange } from './selection-highlight.types';

const DEFAULT_SELECTION_COLOR = '#2563eb';
const SELECTION_ALPHA = 0.28;
const SHOW_TEXT = 4;

interface ColorChannels {
  blue: number;
  green: number;
  red: number;
}

interface HighlightRegistryLike {
  delete(name: string): void;
  set(name: string, highlight: unknown): void;
}

interface NormalizedSelectionRange {
  elementId: string;
  from: number;
  to: number;
}

interface SelectionColors {
  solid: string;
  translucent: string;
}

interface TextNodeSlice {
  end: number;
  node: Text;
  start: number;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

/**
 * Renders a live text selection highlight for a peer.
 *
 * @typeParam TPresence - The peer presence shape.
 * @param props - The peer and selection to highlight.
 * @returns `null`; the component renders through DOM side effects.
 */
export function SelectionHighlight<TPresence extends PresenceData = PresenceData>(
  props: SelectionHighlightProps<TPresence>,
): null {
  const { peer, selection } = props;
  const reactId = useId();
  const highlightName = sanitizeHighlightName(`flockjs-selection-${peer.id}-${reactId}`);
  const resolvedColor = resolvePeerColor(peer);

  useEffect(() => {
    const doc = resolveDocument();
    const normalizedSelection = normalizeSelection(selection);

    if (!doc || !normalizedSelection) {
      return undefined;
    }

    const targetElement = doc.getElementById(normalizedSelection.elementId);
    if (!targetElement) {
      return undefined;
    }

    const textNodes = collectTextNodes(targetElement);
    const domRange = createDomRange(targetElement.ownerDocument, textNodes, normalizedSelection);
    if (!domRange) {
      return undefined;
    }

    const colors = resolveSelectionColors(resolvedColor);
    const customHighlightCleanup = applyCustomHighlight(
      targetElement.ownerDocument,
      domRange,
      highlightName,
      peer.id,
      colors,
    );

    if (customHighlightCleanup !== null) {
      return customHighlightCleanup;
    }

    return applySpanHighlight(textNodes, normalizedSelection, peer.id, colors);
  }, [highlightName, peer.id, resolvedColor, selection]);

  return null;
}

function resolveDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

function normalizeSelection(selection: SelectionRange | null): NormalizedSelectionRange | null {
  if (!selection) {
    return null;
  }

  const elementId = selection.elementId.trim();
  if (elementId === '' || !Number.isFinite(selection.from) || !Number.isFinite(selection.to)) {
    return null;
  }

  const from = Math.max(0, Math.trunc(Math.min(selection.from, selection.to)));
  const to = Math.max(0, Math.trunc(Math.max(selection.from, selection.to)));

  if (from === to) {
    return null;
  }

  return {
    elementId,
    from,
    to,
  };
}

function collectTextNodes(target: HTMLElement): TextNodeSlice[] {
  const textNodes: TextNodeSlice[] = [];
  const walker = target.ownerDocument.createTreeWalker(target, SHOW_TEXT);
  let currentOffset = 0;

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!isTextNode(node) || node.data.length === 0) {
      continue;
    }

    const nextOffset = currentOffset + node.data.length;
    textNodes.push({
      end: nextOffset,
      node,
      start: currentOffset,
    });
    currentOffset = nextOffset;
  }

  return textNodes;
}

function createDomRange(
  doc: Document,
  textNodes: readonly TextNodeSlice[],
  selection: NormalizedSelectionRange,
): Range | null {
  if (textNodes.length === 0) {
    return null;
  }

  const totalLength = textNodes[textNodes.length - 1]?.end ?? 0;
  if (totalLength === 0) {
    return null;
  }

  const startBoundary = resolveRangeBoundary(textNodes, selection.from, totalLength);
  const endBoundary = resolveRangeBoundary(textNodes, selection.to, totalLength);

  if (!startBoundary || !endBoundary) {
    return null;
  }

  const range = doc.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  return range;
}

function resolveRangeBoundary(
  textNodes: readonly TextNodeSlice[],
  offset: number,
  totalLength: number,
): { node: Text; offset: number } | null {
  if (textNodes.length === 0) {
    return null;
  }

  const clampedOffset = Math.min(Math.max(offset, 0), totalLength);

  for (const textNode of textNodes) {
    if (clampedOffset <= textNode.end) {
      return {
        node: textNode.node,
        offset: clampedOffset - textNode.start,
      };
    }
  }

  const lastNode = textNodes[textNodes.length - 1];
  if (!lastNode) {
    return null;
  }

  return {
    node: lastNode.node,
    offset: lastNode.node.data.length,
  };
}

function applyCustomHighlight(
  doc: Document,
  range: Range,
  highlightName: string,
  peerId: string,
  colors: SelectionColors,
): (() => void) | null {
  const registry = readHighlightRegistry(Reflect.get(globalThis, 'CSS'));
  const HighlightCtor = readHighlightConstructor(Reflect.get(globalThis, 'Highlight'));

  if (!registry || !HighlightCtor) {
    return null;
  }

  const styleElement = doc.createElement('style');
  styleElement.setAttribute('data-flockjs-selection-highlight-style', highlightName);
  styleElement.setAttribute('data-flockjs-selection-highlight-style-peer', peerId);
  styleElement.textContent = createHighlightRule(highlightName, colors);

  try {
    const highlight = new HighlightCtor(range);
    registry.set(highlightName, highlight);
    doc.head.appendChild(styleElement);

    return () => {
      registry.delete(highlightName);
      styleElement.remove();
    };
  } catch {
    styleElement.remove();
    return null;
  }
}

function readHighlightRegistry(value: unknown): HighlightRegistryLike | null {
  if (!isObjectLike(value)) {
    return null;
  }

  const highlights = readProperty(value, 'highlights');
  if (!hasHighlightRegistry(highlights)) {
    return null;
  }

  return highlights;
}

function readHighlightConstructor(value: unknown): HighlightConstructor | null {
  return isHighlightConstructor(value) ? value : null;
}

function createHighlightRule(highlightName: string, colors: SelectionColors): string {
  return `::highlight(${highlightName}) { background-color: ${colors.translucent}; color: inherit; }`;
}

function applySpanHighlight(
  textNodes: readonly TextNodeSlice[],
  selection: NormalizedSelectionRange,
  peerId: string,
  colors: SelectionColors,
): () => void {
  const wrappers: HTMLSpanElement[] = [];
  const parents = new Set<Node>();

  for (const textNode of textNodes) {
    const start = Math.max(textNode.start, selection.from);
    const end = Math.min(textNode.end, selection.to);
    if (start >= end) {
      continue;
    }

    const wrapper = wrapTextNodeSegment(
      textNode.node,
      start - textNode.start,
      end - textNode.start,
      peerId,
      colors,
    );

    if (!wrapper) {
      continue;
    }

    wrappers.push(wrapper);
    if (wrapper.parentNode) {
      parents.add(wrapper.parentNode);
    }
  }

  return () => {
    for (let index = wrappers.length - 1; index >= 0; index -= 1) {
      const wrapper = wrappers[index];
      if (!wrapper) {
        continue;
      }

      const parent = wrapper.parentNode;
      if (!parent) {
        continue;
      }

      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }

      parent.removeChild(wrapper);
      parents.add(parent);
    }

    for (const parent of parents) {
      if (hasNormalize(parent)) {
        parent.normalize();
      }
    }
  };
}

function wrapTextNodeSegment(
  node: Text,
  from: number,
  to: number,
  peerId: string,
  colors: SelectionColors,
): HTMLSpanElement | null {
  if (from < 0 || to > node.data.length || from >= to) {
    return null;
  }

  let selectedNode = node;
  if (from > 0) {
    selectedNode = selectedNode.splitText(from);
  }

  const selectedLength = to - from;
  if (selectedLength < selectedNode.data.length) {
    selectedNode.splitText(selectedLength);
  }

  const parent = selectedNode.parentNode;
  if (!parent) {
    return null;
  }

  const wrapper = selectedNode.ownerDocument.createElement('span');
  wrapper.setAttribute('data-flockjs-selection-highlight', 'true');
  wrapper.setAttribute('data-flockjs-selection-highlight-peer', peerId);
  applySpanHighlightStyle(wrapper, colors);

  parent.insertBefore(wrapper, selectedNode);
  wrapper.appendChild(selectedNode);
  return wrapper;
}

function applySpanHighlightStyle(element: HTMLSpanElement, colors: SelectionColors): void {
  element.style.backgroundColor = colors.translucent;
  element.style.borderRadius = '2px';
  element.style.boxShadow = `inset 0 -1px 0 ${colors.solid}`;
  element.style.color = 'inherit';
}

function resolveSelectionColors(color: string): SelectionColors {
  const normalized = normalizeColor(color);
  const channels = parseHexColor(normalized) ?? parseRgbColor(normalized);

  if (!channels) {
    return {
      solid: normalized,
      translucent: 'rgba(37, 99, 235, 0.28)',
    };
  }

  return {
    solid: `rgb(${channels.red}, ${channels.green}, ${channels.blue})`,
    translucent: `rgba(${channels.red}, ${channels.green}, ${channels.blue}, ${SELECTION_ALPHA})`,
  };
}

function normalizeColor(value: string): string {
  const trimmed = value.trim();
  return trimmed === '' ? DEFAULT_SELECTION_COLOR : trimmed;
}

function parseHexColor(value: string): ColorChannels | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) {
    return null;
  }

  const digits = match[1];
  if (!digits) {
    return null;
  }

  const normalizedDigits =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => {
            return `${digit}${digit}`;
          })
          .join('')
      : digits;

  return {
    blue: Number.parseInt(normalizedDigits.slice(4, 6), 16),
    green: Number.parseInt(normalizedDigits.slice(2, 4), 16),
    red: Number.parseInt(normalizedDigits.slice(0, 2), 16),
  };
}

function parseRgbColor(value: string): ColorChannels | null {
  const match =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+)\s*)?\)$/i.exec(
      value,
    );

  if (!match) {
    return null;
  }

  const red = match[1];
  const green = match[2];
  const blue = match[3];
  if (!red || !green || !blue) {
    return null;
  }

  return {
    blue: clampColorChannel(blue),
    green: clampColorChannel(green),
    red: clampColorChannel(red),
  };
}

function clampColorChannel(value: string): number {
  const channel = Number.parseInt(value, 10);
  if (!Number.isFinite(channel)) {
    return 0;
  }

  return Math.min(255, Math.max(0, channel));
}

function sanitizeHighlightName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function readProperty(value: object, key: string): unknown {
  return Reflect.get(value, key);
}

function isHighlightConstructor(value: unknown): value is HighlightConstructor {
  return typeof value === 'function';
}

function hasHighlightRegistry(value: unknown): value is HighlightRegistryLike {
  return (
    isObjectLike(value) &&
    typeof readProperty(value, 'set') === 'function' &&
    typeof readProperty(value, 'delete') === 'function'
  );
}

function hasNormalize(value: unknown): value is Node {
  return isObjectLike(value) && typeof readProperty(value, 'normalize') === 'function';
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function isTextNode(value: Node): value is Text {
  return value.nodeType === 3;
}
