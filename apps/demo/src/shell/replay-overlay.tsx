import type { RoomfulRecording } from '@roomful/core';
import { PeerCursor } from '@roomful/cursors';
import { RoomfulProvider, useCursors, usePresence, useRecording, useRoom } from '@roomful/react';
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { DemoPresence } from '../demo-types';

interface ReplayProps {
  recording: RoomfulRecording;
}

// Streams a recording's frames into the surrounding sandbox room on the replay
// clock, so its engines rebuild presence + cursors exactly as they happened.
function ReplayStage({ recording }: ReplayProps): ReactElement {
  const room = useRoom<DemoPresence>();
  const { replay } = useRecording();
  const { cursors } = useCursors(); // no ref attached → read-only, no local tracking
  const { others } = usePresence<DemoPresence>();
  const [cursor, setCursor] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const sessionRef = useRef<ReturnType<typeof replay> | null>(null);
  const startedRef = useRef(false);
  const frameCount = recording.frames.length;

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const play = useCallback(() => {
    stop();
    setCursor(0);
    const session = replay(recording);
    sessionRef.current = session;
    session.subscribe((event) => {
      setIsPlaying(event.isPlaying);
      setCursor(event.cursor);
      if (event.frame) {
        // Apply the recorded signal to the sandbox room → engines reconstruct it.
        room.applyReplaySignal(event.frame.signal);
      }
    });
    session.play();
  }, [recording, replay, room, stop]);

  // Scrub the timeline: seek re-emits frames up to the point, rebuilding the state there.
  const handleSeek = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    sessionRef.current?.seek(Number(event.currentTarget.value));
  }, []);

  // Auto-play once on open; stop on unmount.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      play();
    }

    return stop;
  }, [play, stop]);

  const finished = !isPlaying && cursor >= frameCount && frameCount > 0;

  return (
    <div className="replay-stage">
      <div className="replay-surface">
        <div className="replay-surface__overlay">
          {cursors.map((cursor) => (
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
        {cursors.length === 0 ? (
          <p className="replay-surface__hint">
            {finished
              ? 'Replay finished — this take had no cursor movement to reconstruct.'
              : 'Reconstructing the session from the recorded signals…'}
          </p>
        ) : null}
      </div>
      <div className="replay-controls">
        <button className="button button--ghost" disabled={isPlaying} onClick={play} type="button">
          {finished ? '↺ Replay again' : '▶ Play'}
        </button>
        <input
          aria-label="Replay timeline"
          className="replay-scrubber"
          disabled={frameCount === 0}
          max={frameCount}
          min={0}
          onChange={handleSeek}
          step={1}
          type="range"
          value={Math.min(cursor, frameCount)}
        />
        <span className="replay-meta" data-testid="replay-position">
          {Math.min(cursor, frameCount)}/{frameCount} · {others.length} peer
          {others.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

interface ReplayOverlayProps extends ReplayProps {
  onClose: () => void;
}

/**
 * A modal that replays a recording visually: it spins up an isolated in-memory
 * "sandbox" room and feeds the recorded frames into it, so the reconstructed
 * cursors/presence play back at the original tempo — no live peers involved.
 */
export function ReplayOverlay({ recording, onClose }: ReplayOverlayProps): ReactElement {
  // A unique id keeps the in-memory sandbox room isolated from any live room.
  const replayIdRef = useRef<string>(`replay-${Math.random().toString(36).slice(2, 10)}`);

  return (
    <div aria-label="Session replay" className="replay-overlay" role="dialog">
      <div className="replay-overlay__panel">
        <header className="replay-overlay__head">
          <span className="replay-overlay__title">Session replay</span>
          <button
            aria-label="Close replay"
            className="replay-overlay__close"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </header>
        <RoomfulProvider<DemoPresence> roomId={replayIdRef.current} transport="broadcast">
          <ReplayStage recording={recording} />
        </RoomfulProvider>
      </div>
    </div>
  );
}
