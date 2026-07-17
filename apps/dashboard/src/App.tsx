import type { JSX } from 'react';
import { useState } from 'react';

import { ProjectsPage } from './pages/ProjectsPage';
import { RoomsPage } from './pages/RoomsPage';

type Page = { type: 'projects' } | { type: 'rooms'; projectId: string; projectName: string };

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>({ type: 'projects' });

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Roomful Cloud</h1>
      <hr />
      {page.type === 'projects' ? (
        <ProjectsPage
          onSelectProject={(id, name) =>
            setPage({ type: 'rooms', projectId: id, projectName: name })
          }
        />
      ) : (
        <RoomsPage
          projectId={page.projectId}
          projectName={page.projectName}
          onBack={() => setPage({ type: 'projects' })}
        />
      )}
    </div>
  );
}
