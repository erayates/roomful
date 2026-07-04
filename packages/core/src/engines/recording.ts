import type { RoomTransportSignal } from '../transports/transport';
import type {
  RecordingDirection,
  RecordingEngine,
  RecordingFrame,
  RecordingState,
  ReplayEvent,
  ReplaySession,
  RoomfulRecording,
  Unsubscribe,
} from '../types';

/**
 * The current `.roomful` recording schema version. Bumped only on a
 * breaking change to {@link RoomfulRecording}, so an importer can refuse a
 * shape it does not understand.
 */
export const RECORDING_FORMAT_VERSION = 1 as const;

/**
 * Bindings the room runtime supplies to a recording engine.
 *
 * The model and its honest limits
 * --------------------------------
 * - **Local, not collaborative.** Unlike the history/comments engines, a
 *   recording is a purely local log of the wire signals THIS peer sees and
 *   sends. It never touches the shared `Y.Doc` and is not synced to peers — two
 *   peers each record their own vantage point.
 * - **Capture is a tap, not a fork.** The room calls {@link RecordingEngine.ingest}
 *   at its inbound (`handleRoomSignal`) and outbound (`dispatchRoomSignal`) choke
 *   points. Ingest is a no-op until `start()`, so the tap costs one boolean
 *   check when idle.
 * - **Replay is a timed re-emission, not a re-application.** A
 *   {@link ReplaySession} streams the captured frames back on a virtual clock
 *   that preserves the original inter-frame gaps. It hands each frame to the
 *   caller; it does NOT feed them back into a room to reconstruct state.
 *   Sandbox re-application is a deliberate later step.
 */
export interface RecordingEngineContext {
  /** The room id stamped onto an exported recording. */
  roomId: string;

  /** The local peer id stamped onto an exported recording. */
  peerId: string;

  /** Overrides the clock used for frame timestamps. Defaults to `Date.now`. */
  now?: () => number;

  /**
   * A privacy hook run on every captured frame before it is stored. Return the frame (its `signal`
   * is a fresh clone, safe to mask in place) to keep it, or `null` to drop it. See
   * {@link RecordingOptions.redact}.
   */
  redact?: (frame: RecordingFrame) => RecordingFrame | null;
}

function cloneSignal(signal: RoomTransportSignal): RoomTransportSignal {
  // ponytail: structuredClone (not JSON) so binary `crdt:sync` payloads
  // (Uint8Array) survive the snapshot intact. Signals are plain wire data, so
  // it never hits a non-cloneable value.
  return structuredClone(signal);
}

function cloneFrame(frame: RecordingFrame): RecordingFrame {
  return {
    t: frame.t,
    direction: frame.direction,
    signal: cloneSignal(frame.signal),
  };
}

/**
 * Builds a timed playback over a fixed list of frames. Each frame is emitted
 * after the same gap that separated it from the previous frame at record time,
 * so playback runs at the original tempo. The session owns a single timer at a
 * time and releases it on `stop()` or when the last frame is reached.
 */
function createReplaySession(frames: readonly RecordingFrame[]): ReplaySession {
  const subscribers = new Set<(event: ReplayEvent) => void>();
  let cursor = 0;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = (frame: RecordingFrame | null): void => {
    const event: ReplayEvent = { frame, isPlaying: playing, cursor };
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  };

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleNext = (): void => {
    const frame = frames[cursor];
    if (frame === undefined) {
      playing = false;
      emit(null);
      return;
    }

    const previousFrame = cursor > 0 ? frames[cursor - 1] : undefined;
    const previousT = previousFrame?.t ?? 0;
    const delay = Math.max(0, frame.t - previousT);

    timer = setTimeout(() => {
      timer = null;
      cursor += 1;
      emit(cloneFrame(frame));
      scheduleNext();
    }, delay);
  };

  return {
    play() {
      if (playing) {
        return;
      }

      playing = true;
      emit(null);
      scheduleNext();
    },
    stop() {
      clearTimer();
      if (!playing) {
        return;
      }

      playing = false;
      emit(null);
    },
    subscribe(callback): Unsubscribe {
      subscribers.add(callback);
      callback({ frame: null, isPlaying: playing, cursor });
      return () => {
        subscribers.delete(callback);
      };
    },
  };
}

/**
 * Creates a session-recording engine bound to a room. Capture is driven by the
 * room calling {@link RecordingEngine.ingest} at its transport boundary; see
 * {@link RecordingEngineContext} for the model and its limits.
 *
 * @param context - The room runtime bindings (room id, peer id, clock).
 * @returns The recording engine bound to the room.
 */
export function createRecordingEngine(context: RecordingEngineContext): RecordingEngine {
  const now = context.now ?? Date.now;

  let recording = false;
  let startedAt = 0;
  let frames: RecordingFrame[] = [];
  const subscribers = new Set<(state: RecordingState) => void>();

  const durationMs = (): number => {
    const last = frames[frames.length - 1];
    return last?.t ?? 0;
  };

  const state = (): RecordingState => {
    return {
      isRecording: recording,
      frameCount: frames.length,
      durationMs: durationMs(),
    };
  };

  const notify = (): void => {
    const snapshot = state();
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  };

  const buildRecording = (): RoomfulRecording => {
    return {
      version: RECORDING_FORMAT_VERSION,
      roomId: context.roomId,
      peerId: context.peerId,
      startedAt,
      durationMs: durationMs(),
      frames: frames.map(cloneFrame),
    };
  };

  return {
    start() {
      frames = [];
      startedAt = now();
      recording = true;
      notify();
    },
    stop() {
      if (!recording) {
        return;
      }

      recording = false;
      notify();
    },
    getState() {
      return state();
    },
    getFrames() {
      return frames.map(cloneFrame);
    },
    export() {
      return buildRecording();
    },
    replay(recordingToPlay) {
      const source = recordingToPlay ?? buildRecording();
      return createReplaySession(source.frames.map(cloneFrame));
    },
    subscribe(callback): Unsubscribe {
      subscribers.add(callback);
      callback(state());
      return () => {
        subscribers.delete(callback);
      };
    },
    ingest(direction: RecordingDirection, signal: RoomTransportSignal) {
      if (!recording) {
        return;
      }

      const frame: RecordingFrame = {
        t: now() - startedAt,
        direction,
        signal: cloneSignal(signal),
      };
      // Privacy hook: drop the frame (null) or store the app's masked version.
      const kept = context.redact ? context.redact(frame) : frame;
      if (kept === null) {
        return;
      }

      frames.push(kept);
      notify();
    },
  };
}
