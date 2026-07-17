import type { JSX } from 'react';

export function App(): JSX.Element {
  const pages = ['projects', 'rooms', 'api-keys'] as const;
  const pageLabels: Record<string, string> = {
    projects: 'Projects',
    rooms: 'Rooms',
    'api-keys': 'API Keys',
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Roomful Cloud</h1>
      <nav style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        {pages.map((p) => (
          <a
            key={p}
            href={`#${p}`}
            style={{
              padding: '0.5rem 1rem',
              textDecoration: 'none',
              color: '#666',
            }}
          >
            {pageLabels[p]}
          </a>
        ))}
      </nav>
      <section>
        <p>Select a page from the navigation above.</p>
      </section>
    </div>
  );
}
