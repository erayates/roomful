import { usePresence, useSharedState } from '@roomful/react';
import { type FormEvent, type ReactElement, useState } from 'react';

import type { DemoPresence } from '../demo-types';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  by: string;
}

interface ChecklistState {
  items: ChecklistItem[];
}

const EMPTY_CHECKLIST: ChecklistState = { items: [] };

export function ChecklistApp(): ReactElement {
  const { self } = usePresence<DemoPresence>();
  const [state, setState] = useSharedState<ChecklistState, DemoPresence>('checklist', {
    initialValue: EMPTY_CHECKLIST,
    persist: false,
    strategy: 'crdt',
  });
  const [draft, setDraft] = useState('');

  const add = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = draft.trim();
    if (text === '') {
      return;
    }

    const item: ChecklistItem = {
      id: globalThis.crypto.randomUUID(),
      text,
      done: false,
      by: self.name ?? 'Someone',
    };
    setState((current) => ({ items: [...current.items, item] }));
    setDraft('');
  };

  const toggle = (id: string): void => {
    setState((current) => ({
      items: current.items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    }));
  };

  const remove = (id: string): void => {
    setState((current) => ({ items: current.items.filter((item) => item.id !== id) }));
  };

  const doneCount = state.items.filter((item) => item.done).length;

  return (
    <div className="checklist-app">
      <form className="checklist-add" onSubmit={add}>
        <input
          aria-label="New checklist item"
          maxLength={80}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Add a shared to-do…"
          value={draft}
        />
        <button className="button button--primary" type="submit">
          Add
        </button>
      </form>
      <p className="checklist-meta">
        {doneCount} / {state.items.length} done
      </p>
      <ul className="checklist">
        {state.items.map((item) => (
          <li className="checklist__item" data-done={item.done} key={item.id}>
            <button
              aria-label={item.done ? 'Mark not done' : 'Mark done'}
              aria-pressed={item.done}
              className="checklist__check"
              onClick={() => {
                toggle(item.id);
              }}
              type="button"
            >
              {item.done ? '✓' : ''}
            </button>
            <span className="checklist__text">{item.text}</span>
            <span className="checklist__by">{item.by}</span>
            <button
              aria-label="Remove item"
              className="checklist__del"
              onClick={() => {
                remove(item.id);
              }}
              type="button"
            >
              ×
            </button>
          </li>
        ))}
        {state.items.length === 0 ? (
          <li className="checklist__empty">No items yet — add the first one for the room.</li>
        ) : null}
      </ul>
    </div>
  );
}
