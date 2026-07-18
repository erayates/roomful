import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { getUsage, listProjects, type RelayProject, type UsageSnapshot } from '../api/client';

interface UsagePageProps {
  onBack: () => void;
}

export function UsagePage({ onBack }: UsagePageProps): JSX.Element {
  const [projects, setProjects] = useState<RelayProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then((list) => {
        setProjects(list);
        const first = list[0];
        if (first) {
          setSelectedProjectId(first.id);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUsage(selectedProjectId)
      .then((snapshot) => {
        if (!cancelled) setUsage(snapshot);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  if (error) {
    return (
      <div>
        <p style={{ color: 'red' }}>Error: {error}</p>
        <button onClick={onBack}>Back</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Usage</h2>
        <button onClick={onBack}>Back</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="project-select">Project: </label>
        <select
          id="project-select"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          style={{ padding: '0.25rem 0.5rem' }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id})
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Loading usage data...</p>
      ) : usage ? (
        <div>
          <h3>Usage Snapshot</h3>
          <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 600 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={thStyle}>Metric</th>
                <th style={thStyle}>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>Rooms</td>
                <td style={tdStyle}>{usage.roomCount}</td>
              </tr>
              <tr>
                <td style={tdStyle}>Connected Peers</td>
                <td style={tdStyle}>{usage.totalPeerCount}</td>
              </tr>
              <tr>
                <td style={tdStyle}>State Size (bytes)</td>
                <td style={tdStyle}>{usage.totalStateBytes.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={tdStyle}>Sampled At</td>
                <td style={tdStyle}>{new Date(usage.sampledAt).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p>No usage data available.</p>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '0.5rem',
  textAlign: 'left',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '0.5rem',
};
