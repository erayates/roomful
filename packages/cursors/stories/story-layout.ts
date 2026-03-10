import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

export interface StorySurfaceProps {
  background?: string;
  children?: ReactNode;
  height?: number;
  padding?: number;
  width?: number | string;
}

export interface StoryGridProps {
  children?: ReactNode;
  columns?: number;
}

export interface StoryStackProps {
  children?: ReactNode;
}

const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 240;
const DEFAULT_BACKGROUND = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';

export function StorySurface(props: StorySurfaceProps): ReactElement {
  const { background, children, height, padding, width } = props;

  return createElement(
    'div',
    {
      style: createSurfaceStyle(width, height, padding, background),
    },
    children,
  );
}

export function StoryGrid(props: StoryGridProps): ReactElement {
  return createElement(
    'div',
    {
      style: createGridStyle(props.columns),
    },
    props.children,
  );
}

export function StoryStack(props: StoryStackProps): ReactElement {
  return createElement(
    'div',
    {
      style: createStackStyle(),
    },
    props.children,
  );
}

function createSurfaceStyle(
  width: number | string | undefined,
  height: number | undefined,
  padding: number | undefined,
  background: string | undefined,
): CSSProperties {
  return {
    alignItems: 'center',
    background: background ?? DEFAULT_BACKGROUND,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: '24px',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center',
    minHeight: `${height ?? DEFAULT_HEIGHT}px`,
    overflow: 'hidden',
    padding: `${padding ?? 24}px`,
    position: 'relative',
    width: typeof width === 'number' ? `${width}px` : (width ?? `${DEFAULT_WIDTH}px`),
  };
}

function createGridStyle(columns: number | undefined): CSSProperties {
  return {
    display: 'grid',
    gap: '18px',
    gridTemplateColumns: `repeat(${columns ?? 2}, minmax(0, 1fr))`,
    width: '100%',
  };
}

function createStackStyle(): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
  };
}
