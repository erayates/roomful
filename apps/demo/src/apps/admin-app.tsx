import { usePeers, useRoom } from '@roomful/react';
import { type ReactElement, useEffect, useState } from 'react';

import type { MiniAppProps } from './registry';

// ponytail: admin dashboard — peers table + diagnostics snapshot.
export function AdminApp(props: MiniAppProps): ReactElement {
  void props;
  const peers = usePeers();
  const room = useRoom();
  const [diag, setDiag] = useState('');

  useEffect(() => {
    void room.getDiagnostics().then((d) => setDiag(JSON.stringify(d, null, 2)));
  }, [room]);

  return (
    <div className="admin-app">
      <header>
        <h3>Admin dashboard</h3>
        <span>{peers.length} peers online</span>
      </header>
      <table>
        <thead>
          <tr><th>Peer</th><th>Joined</th></tr>
        </thead>
        <tbody>
          {peers.map((p) => (
            <tr key={p.id}><td><code>{p.id.slice(0, 8)}</code></td><td>{new Date(p.joinedAt).toLocaleTimeString()}</td></tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>Diagnostics</summary>
        <pre>{diag}</pre>
      </details>
    </div>
  );
}
