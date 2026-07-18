import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { ApiKeyRecord, CreatedApiKey } from '../api/api-keys';
import { createApiKey, listApiKeys, revokeApiKey } from '../api/api-keys';

export function ApiKeysPage(): JSX.Element {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listApiKeys();
      setKeys(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async (): Promise<void> => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createApiKey(newKeyName.trim());
      setCreatedKey(result);
      setNewKeyName('');
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string): Promise<void> => {
    try {
      await revokeApiKey(id);
      setRevokingId(null);
      setCreatedKey(null);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    }
  };

  if (loading) return <div data-testid="loading">Loading API keys...</div>;

  return (
    <div data-testid="api-keys-page">
      <h2>API Keys</h2>

      {error && (
        <div style={{ color: '#c0392b', marginBottom: '0.5rem' }}>
          Error: {error}
          <button
            onClick={() => {
              void fetchKeys();
            }}
            style={{ marginLeft: '0.5rem' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Created key notification */}
      {createdKey && (
        <div
          style={{
            border: '2px solid #27ae60',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            background: '#f0fff4',
          }}
          data-testid="created-key-notification"
        >
          <p>
            <strong>API key created!</strong>
          </p>
          <p>
            Secret: <code data-testid="key-secret">{createdKey.secret}</code>
          </p>
          <p style={{ fontSize: '0.9em', color: '#666' }}>
            Copy this now — you won&apos;t see it again.
          </p>
          <button onClick={() => setCreatedKey(null)} style={{ marginTop: '0.5rem' }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name"
          data-testid="key-name-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
          }}
        />
        <button
          onClick={() => {
            void handleCreate();
          }}
          disabled={creating || !newKeyName.trim()}
          data-testid="create-key-btn"
        >
          {creating ? 'Creating...' : 'Create Key'}
        </button>
      </div>

      {/* Revoke confirmation */}
      {revokingId && (
        <div
          style={{
            border: '1px solid #c0392b',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
          data-testid="confirm-revoke"
        >
          <p>
            Revoke key &ldquo;{keys.find((k) => k.id === revokingId)?.name}&rdquo;? This cannot be
            undone.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {
                void handleRevoke(revokingId);
              }}
              style={{ background: '#c0392b', color: 'white' }}
            >
              Revoke
            </button>
            <button onClick={() => setRevokingId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Key list */}
      {keys.length === 0 ? (
        <p data-testid="empty-state">No API keys yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="keys-table">
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Name</th>
              <th style={{ padding: '0.5rem' }}>Prefix</th>
              <th style={{ padding: '0.5rem' }}>Scopes</th>
              <th style={{ padding: '0.5rem' }}>Created</th>
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{key.name}</td>
                <td style={{ padding: '0.5rem' }}>
                  <code>{key.keyPrefix}...</code>
                </td>
                <td style={{ padding: '0.5rem' }}>{key.scopes.join(', ')}</td>
                <td style={{ padding: '0.5rem' }}>
                  {new Date(key.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <button onClick={() => setRevokingId(key.id)} style={{ color: '#c0392b' }}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
