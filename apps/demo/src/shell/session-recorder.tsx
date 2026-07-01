import type { RoomfulRecording } from '@roomful/core';
import { useRecording } from '@roomful/react';
import { type ReactElement, useCallback, useState } from 'react';

import { ReplayOverlay } from './replay-overlay';

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * A live session recorder docked under the active mini-app. It taps the same
 * room the app uses, so Record captures that app's real collaboration signals;
 * Replay opens a visual playback (a sandbox room reconstructs the session) and
 * Export saves a `.roomful` file. Demonstrates `useRecording` against genuine
 * traffic.
 */
export function SessionRecorder(): ReactElement {
  const { isRecording, frameCount, durationMs, start, stop, exportRecording } = useRecording();
  const [replayRecording, setReplayRecording] = useState<RoomfulRecording | null>(null);

  const handleReplay = useCallback(() => {
    setReplayRecording(exportRecording());
  }, [exportRecording]);

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
            ? 'Replay reconstructs the session visually, or export it as a .roomful file.'
            : 'Press Record, then use the app above to capture its live collaboration signals.'}
      </p>

      {replayRecording ? (
        <ReplayOverlay
          onClose={() => {
            setReplayRecording(null);
          }}
          recording={replayRecording}
        />
      ) : null}
    </aside>
  );
}
