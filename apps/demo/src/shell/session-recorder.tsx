import type { RecordingFrame } from '@roomful/core';
import { useRecording } from '@roomful/react';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';

// Keep the streamed replay log bounded so a long take never bloats the DOM.
const MAX_VISIBLE_FRAMES = 60;

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function frameLabel(frame: RecordingFrame): string {
  const arrow = frame.direction === 'inbound' ? '←' : '→';
  return `${(frame.t / 1000).toFixed(2)}s  ${arrow}  ${frame.signal.type}`;
}

interface ReplayRow {
  key: number;
  frame: RecordingFrame;
}

/**
 * A live session recorder docked under the active mini-app. It taps the same
 * room the app uses, so Record captures that app's real collaboration signals;
 * Replay streams them back at the original tempo and Export saves a `.roomful`
 * file. Demonstrates `useRecording` against genuine traffic.
 */
export function SessionRecorder(): ReactElement {
  const { isRecording, frameCount, durationMs, start, stop, replay, exportRecording } =
    useRecording();
  const [replayLog, setReplayLog] = useState<ReplayRow[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const sessionRef = useRef<ReturnType<typeof replay> | null>(null);
  const replayKeyRef = useRef(0);

  // Stop any in-flight replay when the panel unmounts (e.g. switching apps).
  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  const handleReplay = useCallback(() => {
    sessionRef.current?.stop();
    setReplayLog([]);
    const session = replay();
    sessionRef.current = session;
    session.subscribe((event) => {
      setIsReplaying(event.isPlaying);
      const { frame } = event;
      if (frame) {
        setReplayLog((log) => {
          const next = [...log, { key: replayKeyRef.current++, frame }];
          return next.slice(-MAX_VISIBLE_FRAMES);
        });
      }
    });
    session.play();
  }, [replay]);

  const handleExport = useCallback(() => {
    const recording = exportRecording();
    const blob = new Blob([JSON.stringify(recording, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${recording.roomId}.roomful`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [exportRecording]);

  const hasFrames = frameCount > 0;

  return (
    <aside className="recorder">
      <header className="recorder__head">
        <span className="recorder__title">
          <span
            aria-hidden="true"
            className={`recorder__dot${isRecording ? ' recorder__dot--live' : ''}`}
          />
          Session recorder
        </span>
        <span className="recorder__stat">
          {frameCount} signal{frameCount === 1 ? '' : 's'} · {formatSeconds(durationMs)}
        </span>
      </header>

      <div className="recorder__controls">
        <button
          className={`button ${isRecording ? 'button--ghost' : 'button--primary'}`}
          onClick={isRecording ? stop : start}
          type="button"
        >
          {isRecording ? '■ Stop' : '● Record'}
        </button>
        <button
          className="button button--ghost"
          disabled={isRecording || !hasFrames}
          onClick={handleReplay}
          type="button"
        >
          ▶ Replay
        </button>
        <button
          className="button button--ghost"
          disabled={isRecording || !hasFrames}
          onClick={handleExport}
          type="button"
        >
          ↓ Export
        </button>
      </div>

      <p className="recorder__hint">
        {isRecording
          ? 'Capturing this room’s wire signals — interact with the app or open another tab.'
          : hasFrames
            ? isReplaying
              ? 'Replaying at the original tempo…'
              : 'Replay streams the captured signals back in real time, or export them as a .roomful file.'
            : 'Press Record, then use the app above to capture its live collaboration signals.'}
      </p>

      {replayLog.length > 0 ? (
        <ol className="recorder__log">
          {replayLog.map((row) => (
            <li className="recorder__log-row" data-direction={row.frame.direction} key={row.key}>
              {frameLabel(row.frame)}
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}
