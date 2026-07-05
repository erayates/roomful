import { useRoom } from '@roomful/react';
import { type ReactElement, useCallback, useState } from 'react';

import type { MiniAppProps } from './registry';

export function AuditLogApp(props: MiniAppProps): ReactElement {
  void props.identity;
  const room = useRoom();
  const log = room.useAuditLog();
  const [entries, setEntries] = useState(() => [...log.entries()]);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setEntries([...log.entries()]);
  }, [log]);

  const verify = useCallback(() => {
    const result = log.verify();
    setVerifyResult(result.valid ? '✅ Chain valid' : `❌ Broken at index ${result.breakIndex}`);
    refresh();
  }, [log, refresh]);

  return (
    <div className="audit-log-app">
      <header className="audit-log-header">
        <span>{entries.length} entries</span>
        <button onClick={refresh}>Refresh</button>
        <button onClick={verify}>Verify</button>
      </header>
      {verifyResult !== null && <p className="audit-log-verify-result">{verifyResult}</p>}
      <ul className="audit-log-list">
        {entries.map((entry) => (
          <li key={entry.index} className="audit-log-entry">
            <code>{entry.timestamp.slice(11, 19)}</code>
            <strong>{entry.event}</strong>
            <small>{entry.actor}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
