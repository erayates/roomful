import type { JSX } from 'react';
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { useCallback, useEffect, useState } from 'react';

import type { RelayProject } from '../api/client';
import { createProject, deleteProject, listProjects, updateProject } from '../api/client';

interface FormData {
  name: string;
  description: string;
}

const EMPTY_FORM: FormData = { name: '', description: '' };

function validateForm(data: FormData): string | null {
  if (!data.name.trim()) return 'Project name is required.';
  if (data.name.length > 256) return 'Project name must be 256 characters or fewer.';
  return null;
}

export function ProjectsPage(): JSX.Element {
  const [projects, setProjects] = useState<RelayProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create / edit state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProjects();
      setProjects(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const handleSubmit = async (): Promise<void> => {
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const updateInput: Record<string, string> = { name: form.name };
        if (form.description) updateInput.description = form.description;
        await updateProject(
          editingId,
          updateInput as unknown as Parameters<typeof updateProject>[1],
        );
      } else {
        const createInput: Record<string, string> = { name: form.name, ownerId: 'dashboard' };
        if (form.description) createInput.description = form.description;
        await createProject(createInput as unknown as Parameters<typeof createProject>[0]);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await fetchProjects();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (project: RelayProject): void => {
    setEditingId(project.id);
    setForm({ name: project.name, description: project.description ?? '' });
    setShowForm(true);
    setFormError(null);
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deleteProject(id);
      setDeletingId(null);
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const resetForm = (): void => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  if (loading) {
    return <div data-testid="loading">Loading projects...</div>;
  }

  if (error) {
    return (
      <div data-testid="error">
        <p>Error: {error}</p>
        <button
          onClick={() => {
            void fetchProjects();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div data-testid="projects-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Projects</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          data-testid="new-project-btn"
        >
          + New Project
        </button>
      </div>

      {showForm && (
        <div
          style={{
            border: '1px solid #ddd',
            padding: '1rem',
            marginBottom: '1rem',
            borderRadius: '4px',
          }}
          data-testid="project-form"
        >
          <h3>{editingId ? 'Edit Project' : 'New Project'}</h3>
          {formError && <p style={{ color: 'red' }}>{formError}</p>}
          <div>
            <label>
              Name *<br />
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="project-name-input"
                style={{ width: '100%' }}
              />
            </label>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <label>
              Description
              <br />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                data-testid="project-desc-input"
                style={{ width: '100%' }}
              />
            </label>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {
                void handleSubmit();
              }}
              disabled={saving}
              data-testid="save-project-btn"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={resetForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {deletingId && (
        <div
          style={{
            border: '1px solid #e74c3c',
            padding: '1rem',
            marginBottom: '1rem',
            borderRadius: '4px',
          }}
          data-testid="confirm-delete"
        >
          <p>Delete project "{projects.find((p) => p.id === deletingId)?.name}"?</p>
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

      {projects.length === 0 ? (
        <p data-testid="empty-state">No projects yet. Create one to get started.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="projects-table">
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Name</th>
              <th style={{ padding: '0.5rem' }}>Description</th>
              <th style={{ padding: '0.5rem' }}>Created</th>
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr
                key={project.id}
                style={{ borderBottom: '1px solid #eee' }}
                data-testid={`project-row-${project.id}`}
              >
                <td style={{ padding: '0.5rem' }}>{project.name}</td>
                <td style={{ padding: '0.5rem' }}>{project.description ?? '—'}</td>
                <td style={{ padding: '0.5rem' }}>
                  {new Date(project.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <button onClick={() => handleEdit(project)}>Edit</button>{' '}
                  <button onClick={() => setDeletingId(project.id)} style={{ color: '#c0392b' }}>
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
