import { PeerCursor } from '@roomful/cursors';
import { useCursors, useEvent, usePresence } from '@roomful/react';
import { type FormEvent, type ReactElement, useRef, useState } from 'react';

import type { DemoPresence } from '../demo-types';

interface ChatBubble {
  id: string;
  text: string;
}

interface OwnBubble extends ChatBubble {
  x: number;
  y: number;
}

const BUBBLE_TTL_MS = 4_500;

export function ChatApp(): ReactElement {
  const { self } = usePresence<DemoPresence>();
  const cursorTracking = useCursors({ idleAfterMs: 4_000, throttleMs: 24 });
  const [draft, setDraft] = useState('');
  const [peerBubbles, setPeerBubbles] = useState<Record<string, ChatBubble>>({});
  const [myBubble, setMyBubble] = useState<OwnBubble | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.4 });

  const send = useEvent<{ text: string }, DemoPresence>('cursor-chat', (payload, from) => {
    if (from.id === self.id) {
      return;
    }

    const id = globalThis.crypto.randomUUID();
    setPeerBubbles((current) => ({ ...current, [from.id]: { id, text: payload.text } }));
    window.setTimeout(() => {
      setPeerBubbles((current) => {
        if (current[from.id]?.id !== id) {
          return current;
        }

        const next = { ...current };
        delete next[from.id];
        return next;
      });
    }, BUBBLE_TTL_MS);
  });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = draft.trim().slice(0, 120);
    if (text === '') {
      return;
    }

    send({ text });
    const id = globalThis.crypto.randomUUID();
    setMyBubble({ id, text, x: pointerRef.current.x, y: pointerRef.current.y });
    window.setTimeout(() => {
      setMyBubble((current) => (current?.id === id ? null : current));
    }, BUBBLE_TTL_MS);
    setDraft('');
  };

  const cursorById = new Map(cursorTracking.cursors.map((cursor) => [cursor.userId, cursor]));

  return (
    <div className="chat-app">
      <div
        className="cursors-surface chat-surface"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          pointerRef.current = {
            x: (event.clientX - bounds.left) / Math.max(bounds.width, 1),
            y: (event.clientY - bounds.top) / Math.max(bounds.height, 1),
          };
        }}
        ref={cursorTracking.ref}
      >
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
          {Object.entries(peerBubbles).map(([peerId, bubble]) => {
            const cursor = cursorById.get(peerId);
            if (!cursor) {
              return null;
            }

            return (
              <span
                className="chat-bubble"
                key={bubble.id}
                style={{
                  left: `${String(cursor.x * 100)}%`,
                  top: `${String(cursor.y * 100)}%`,
                  borderColor: cursor.color,
                }}
              >
                {bubble.text}
              </span>
            );
          })}
          {myBubble ? (
            <span
              className="chat-bubble chat-bubble--me"
              style={{ left: `${String(myBubble.x * 100)}%`, top: `${String(myBubble.y * 100)}%` }}
            >
              {myBubble.text}
            </span>
          ) : null}
        </div>
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input
          aria-label="Cursor chat message"
          maxLength={120}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Type and press Enter — it pops by your cursor"
          value={draft}
        />
        <button className="button button--primary" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
