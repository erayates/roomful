import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement, type CSSProperties, type ReactElement, useId } from 'react';

import { SelectionHighlight } from '../src';
import {
  createStoryPeer,
  SAMPLE_SELECTION_TEXT,
  type StoryPresence,
} from './story-fixtures';
import { StoryStack, StorySurface } from './story-layout';

interface SelectionHighlightStoryArgs {
  color: string;
  enabled: boolean;
  from: number;
  to: number;
}

const meta = {
  title: '@flockjs/cursors/SelectionHighlight',
  tags: ['autodocs'],
  args: {
    color: '#2563eb',
    enabled: true,
    from: 4,
    to: 17,
  },
  argTypes: {
    color: {
      control: 'color',
    },
    enabled: {
      control: 'boolean',
    },
    from: {
      control: { type: 'range', min: 0, max: SAMPLE_SELECTION_TEXT.length, step: 1 },
    },
    to: {
      control: { type: 'range', min: 0, max: SAMPLE_SELECTION_TEXT.length, step: 1 },
    },
  },
  render: (args) => {
    return createElement(SelectionHighlightPreview, args);
  },
} satisfies Meta<SelectionHighlightStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {},
};

export const ReversedRange: Story = {
  args: {
    from: 28,
    to: 9,
  },
};

export const NoSelection: Story = {
  args: {
    enabled: false,
  },
};

function SelectionHighlightPreview(props: SelectionHighlightStoryArgs): ReactElement {
  const reactId = useId();
  const elementId = `selection-story-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`;
  const peer = createStoryPeer(0, {
    color: props.color,
    name: 'Ada Lovelace',
  });
  const selection = props.enabled
    ? {
        elementId,
        from: props.from,
        to: props.to,
      }
    : null;

  return createElement(
    StoryStack,
    null,
    createElement(
      StorySurface,
      {
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        height: 280,
        width: 560,
      },
      createElement(
        'div',
        {
          style: createTextWrapStyle(),
        },
        createElement(
          'p',
          {
            id: elementId,
            style: createTextStyle(),
          },
          SAMPLE_SELECTION_TEXT,
        ),
        createElement(SelectionHighlight<StoryPresence>, {
          peer,
          selection,
        }),
      ),
    ),
    createElement(
      'p',
      {
        style: createCaptionStyle(),
      },
      props.enabled
        ? `Highlighting character range ${props.from} to ${props.to}.`
        : 'Selection disabled.',
    ),
  );
}

function createTextWrapStyle(): CSSProperties {
  return {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: '18px',
    maxWidth: '100%',
    padding: '24px',
  };
}

function createTextStyle(): CSSProperties {
  return {
    color: '#0f172a',
    fontSize: '18px',
    lineHeight: 1.7,
    margin: 0,
  };
}

function createCaptionStyle(): CSSProperties {
  return {
    color: '#475569',
    fontSize: '13px',
    margin: 0,
  };
}
