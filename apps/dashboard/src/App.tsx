import type { JSX } from 'react';
import { useState } from 'react';

import { ApiKeysPage } from './pages/ApiKeysPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { RoomsPage } from './pages/RoomsPage';

type Page =
  | { type: 'projects' }
  | { type: 'rooms'; projectId: string; projectName: string }
  | { type: 'api-keys' };

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>({ type: 'projects' });

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1>Roomful Cloud</h1>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setPage({ type: 'projects' })}>Projects</button>
          <button onClick={() => setPage({ type: 'api-keys' })}>API Keys</button>
        </nav>
      </div>
      <hr />
      {page.type === 'projects' ? (
        <ProjectsPage
          onSelectProject={(id, name) =>
            setPage({ type: 'rooms', projectId: id, projectName: name })
          }
        />
      ) : page.type === 'rooms' ? (
        <RoomsPage
          projectId={page.projectId}
          projectName={page.projectName}
          onBack={() => setPage({ type: 'projects' })}
        />
      ) : (
        <ApiKeysPage />
      )}
    </div>
  );
}
