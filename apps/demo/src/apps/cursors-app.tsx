import { PeerCursor } from '@roomful/cursors';
import { useCursors, usePresence } from '@roomful/react';
import type { ReactElement } from 'react';

import type { DemoPresence } from '../demo-types';

export function CursorsApp(): ReactElement {
  const { others } = usePresence<DemoPresence>();
  const cursorTracking = useCursors({ idleAfterMs: 3_000, throttleMs: 24 });

  return (
    <div className="cursors-app">
      <div className="cursors-surface" ref={cursorTracking.ref}>
        <div className="cursors-surface__overlay">
          {cursorTracking.cursors.map((cursor) => (
            <PeerCursor
              color={cursor.color}
              idle={cursor.idle}
              key={cursor.userId}
              name={cursor.name}
              style="pointer"
              x={cursor.x}
              y={cursor.y}
            />
          ))}
        </div>
        <p className="cursors-surface__hint">
          {others.length > 0
            ? `${String(others.length)} ${others.length === 1 ? 'teammate is' : 'teammates are'} here — move your pointer.`
            : 'Move your pointer here, then open a second tab to watch cursors sync live.'}
        </p>
      </div>
    </div>
  );
}
