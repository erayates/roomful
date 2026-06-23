import { useSharedState } from '@roomful/react';
import type { ChangeEvent, ReactElement } from 'react';

import { DEMO_PALETTE } from '../demo-palette';
import type { DemoPresence } from '../demo-types';

interface Note {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
}

interface NotesState {
  notes: Note[];
}

const EMPTY_NOTES: NotesState = { notes: [] };

export function NotesApp(): ReactElement {
  const [state, setState] = useSharedState<NotesState, DemoPresence>('notes', {
    initialValue: EMPTY_NOTES,
    persist: false,
    strategy: 'crdt',
  });

  const addNote = (): void => {
    const color = DEMO_PALETTE[Math.floor(Math.random() * DEMO_PALETTE.length)] ?? '#fbbf24';
    const note: Note = {
      id: globalThis.crypto.randomUUID(),
      text: '',
      color,
      x: 6 + Math.random() * 68,
      y: 6 + Math.random() * 58,
    };
    setState((current) => ({ notes: [...current.notes, note] }));
  };

  const editNote = (id: string, text: string): void => {
    setState((current) => ({
      notes: current.notes.map((note) => (note.id === id ? { ...note, text } : note)),
    }));
  };

  const deleteNote = (id: string): void => {
    setState((current) => ({ notes: current.notes.filter((note) => note.id !== id) }));
  };

  return (
    <div className="notes-app">
      <div className="notes-bar">
        <button className="button button--primary" onClick={addNote} type="button">
          + Add note
        </button>
        <span className="notes-count">{state.notes.length} on the board</span>
      </div>
      <div className="notes-board">
        {state.notes.map((note) => (
          <div
            className="note"
            key={note.id}
            style={{
              left: `${String(note.x)}%`,
              top: `${String(note.y)}%`,
              borderColor: note.color,
            }}
          >
            <textarea
              aria-label="Note text"
              maxLength={140}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                editNote(note.id, event.target.value);
              }}
              placeholder="Type a note…"
              value={note.text}
            />
            <button
              aria-label="Delete note"
              className="note__delete"
              onClick={() => {
                deleteNote(note.id);
              }}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
        {state.notes.length === 0 ? (
          <p className="notes-empty">Add a note — it shows up for everyone in the room.</p>
        ) : null}
      </div>
    </div>
  );
}
