import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { RelayRoom, UsageSnapshot } from '../api/client';
import { createRoom, deleteRoom, getUsage, listRooms } from '../api/client';

interface RoomsPageProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

export function RoomsPage({ projectId, projectName, onBack }: RoomsPageProps): JSX.Element {
  const [rooms, setRooms] = useState<RelayRoom[]>([]);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, u] = await Promise.all([listRooms(projectId), getUsage(projectId)]);
      setRooms(r);
      setUsage(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreate = async (): Promise<void> => {
    if (!newRoomName.trim()) return;
    setCreating(true);
    try {
      await createRoom(projectId, { name: newRoomName.trim() });
      setNewRoomName('');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (roomId: string): Promise<void> => {
    try {
      await deleteRoom(projectId, roomId);
      setDeletingId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room');
    }
  };

  if (loading) return <div data-testid="loading">Loading rooms...</div>;

  return (
    <div data-testid="rooms-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={onBack}>&larr; Back</button>
        <h2>{projectName} &mdash; Rooms</h2>
      </div>

      {error && (
        <div style={{ color: '#c0392b', margin: '0.5rem 0' }}>
          Error: {error}
          <button
            onClick={() => {
              void fetchData();
            }}
            style={{ marginLeft: '0.5rem' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Usage summary */}
      {usage && (
        <div
          style={{
            border: '1px solid #ddd',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            display: 'flex',
            gap: '2rem',
          }}
          data-testid="usage-summary"
        >
          <div>
            <strong>Rooms:</strong> {usage.roomCount}
          </div>
          <div>
            <strong>Peers:</strong> {usage.totalPeerCount}
          </div>
          <div>
            <strong>Storage:</strong> {(usage.totalStateBytes / 1024).toFixed(1)} KB
          </div>
          <div>
            <strong>Sampled:</strong> {new Date(usage.sampledAt).toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* Create room */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          placeholder="New room name"
          data-testid="room-name-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
          }}
        />
        <button
          onClick={() => {
            void handleCreate();
          }}
          disabled={creating || !newRoomName.trim()}
          data-testid="create-room-btn"
        >
          {creating ? 'Creating...' : 'Add Room'}
        </button>
      </div>

      {/* Delete confirmation */}
      {deletingId && (
        <div
          style={{
            border: '1px solid #c0392b',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          <p>
            Delete room &ldquo;{rooms.find((r) => r.id === deletingId)?.name ?? deletingId}&rdquo;?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {
                void handleDelete(deletingId);
              }}
              style={{ background: '#c0392b', color: 'white' }}
            >
              Delete
            </button>
            <button onClick={() => setDeletingId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Room list */}
      {rooms.length === 0 ? (
        <p data-testid="empty-state">No rooms yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="rooms-table">
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Name</th>
              <th style={{ padding: '0.5rem' }}>Ephemeral</th>
              <th style={{ padding: '0.5rem' }}>TTL (ms)</th>
              <th style={{ padding: '0.5rem' }}>Created</th>
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{room.name ?? room.id}</td>
                <td style={{ padding: '0.5rem' }}>{room.ephemeral ? 'Yes' : 'No'}</td>
                <td style={{ padding: '0.5rem' }}>{room.ttlMs}</td>
                <td style={{ padding: '0.5rem' }}>
                  {new Date(room.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <button onClick={() => setDeletingId(room.id)} style={{ color: '#c0392b' }}>
                    Delete
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
