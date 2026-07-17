import type { JSX } from 'react';

import { ProjectsPage } from './pages/ProjectsPage';

export function App(): JSX.Element {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Roomful Cloud</h1>
      <hr />
      <ProjectsPage />
    </div>
  );
}
