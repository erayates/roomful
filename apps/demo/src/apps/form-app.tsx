import { useFieldPresence, useLocks, usePresence, useSharedState } from '@roomful/react';
import { type ReactElement, useCallback } from 'react';

import type { DemoPresence } from '../demo-types';

interface FormState {
  name: string;
  email: string;
  role: string;
}

interface FieldDef {
  id: keyof FormState;
  label: string;
  type: 'text' | 'email' | 'select';
  options?: readonly string[];
}

const FIELDS: readonly FieldDef[] = [
  { id: 'name', label: 'Full name', type: 'text' },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'role', label: 'Role', type: 'select', options: ['Owner', 'Editor', 'Viewer'] },
];

const EMPTY_FORM: FormState = { name: '', email: '', role: 'Editor' };

function dotColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360;
  }

  return `hsl(${String(hash)}, 62%, 62%)`;
}

export function FormApp(): ReactElement {
  const { self } = usePresence<DemoPresence>();
  const [form, setForm] = useSharedState<FormState, DemoPresence>('form', {
    initialValue: EMPTY_FORM,
    persist: false,
    strategy: 'crdt',
  });
  const fieldPresence = useFieldPresence<DemoPresence>();
  const locks = useLocks<DemoPresence>();

  // Focus = "I'm editing this field": announce presence + claim the advisory lock.
  const onFocus = useCallback(
    (fieldId: string): void => {
      fieldPresence.setActiveField(fieldId);
      void locks.acquire(fieldId);
    },
    [fieldPresence, locks],
  );

  const onBlur = useCallback(
    (fieldId: string): void => {
      fieldPresence.setActiveField(null);
      locks.release(fieldId);
    },
    [fieldPresence, locks],
  );

  return (
    <div className="form-app">
      <p className="form-app__hint">
        Focus a field to claim it. While you hold it, others see a lock and can't type — presence +
        record locks make editing safe.
      </p>

      <div className="form-fields">
        {FIELDS.map((field) => {
          const holder = locks.locks.find((lock) => lock.key === field.id)?.holder ?? null;
          const lockedByOther = holder !== null && holder.id !== self.id;
          const watchers = fieldPresence.getFieldPeers(field.id);

          return (
            <label className="form-field" data-locked={lockedByOther} key={field.id}>
              <span className="form-field__label">
                {field.label}
                {watchers.length > 0 ? (
                  <span className="form-field__watchers">
                    {watchers.map((peer) => (
                      <span
                        className="form-field__watcher"
                        key={peer.id}
                        style={{ background: dotColor(peer.id) }}
                        title={peer.name ?? peer.id}
                      />
                    ))}
                  </span>
                ) : null}
              </span>

              {field.type === 'select' ? (
                <select
                  disabled={lockedByOther}
                  onBlur={() => {
                    onBlur(field.id);
                  }}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, role: event.target.value }));
                  }}
                  onFocus={() => {
                    onFocus(field.id);
                  }}
                  value={form.role}
                >
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  disabled={lockedByOther}
                  onBlur={() => {
                    onBlur(field.id);
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((current) => ({ ...current, [field.id]: value }));
                  }}
                  onFocus={() => {
                    onFocus(field.id);
                  }}
                  type={field.type}
                  value={form[field.id]}
                />
              )}

              {lockedByOther ? (
                <span className="form-field__lock">🔒 {holder.name ?? 'Someone'} is editing</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}
