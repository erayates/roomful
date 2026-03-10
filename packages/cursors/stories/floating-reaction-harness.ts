import { createElement, type CSSProperties, type ReactElement, useEffect, useState } from 'react';

import { FloatingReaction } from '../src';
import { StoryStack, StorySurface } from './story-layout';

export interface FloatingReactionHarnessProps {
  delayMs?: number;
  durationMs?: number;
  emoji: string;
  size?: number;
  x: number;
  y: number;
}

const REPLAY_GAP_MS = 420;

export function FloatingReactionHarness(props: FloatingReactionHarnessProps): ReactElement {
  const [iteration, setIteration] = useState(0);
  const duration = Math.max(0, props.durationMs ?? 1_500);
  const delay = Math.max(0, props.delayMs ?? 0);
  const totalDuration = duration + delay;

  useEffect(() => {
    setIteration((currentIteration) => {
      return currentIteration + 1;
    });
  }, [props.delayMs, props.durationMs, props.emoji, props.size, props.x, props.y]);

  useEffect(() => {
    const timeoutId = globalThis.setTimeout(() => {
      setIteration((currentIteration) => {
        return currentIteration + 1;
      });
    }, totalDuration + REPLAY_GAP_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [iteration, totalDuration]);

  return createElement(
    StoryStack,
    null,
    createElement(
      StorySurface,
      {
        background: 'linear-gradient(135deg, #fff7ed 0%, #fde68a 100%)',
        height: 260,
        width: 360,
      },
      createElement(FloatingReaction, {
        key: `${props.emoji}-${iteration}`,
        emoji: props.emoji,
        x: props.x,
        y: props.y,
        ...(props.delayMs === undefined ? {} : { delayMs: props.delayMs }),
        ...(props.durationMs === undefined ? {} : { durationMs: props.durationMs }),
        ...(props.size === undefined ? {} : { size: props.size }),
      }),
    ),
    createElement(
      'button',
      {
        onClick: () => {
          setIteration((currentIteration) => {
            return currentIteration + 1;
          });
        },
        style: createButtonStyle(),
        type: 'button',
      },
      'Replay reaction',
    ),
  );
}

function createButtonStyle(): CSSProperties {
  return {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    border: '0',
    borderRadius: '9999px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 700,
    padding: '10px 14px',
  };
}
