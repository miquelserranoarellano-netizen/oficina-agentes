import { useState, type FormEvent } from 'react';
import { PROJECT_COLORS } from '../../shared/data.ts';
import type { Project, ProjectInput, ProjectStatus } from '../../shared/types.ts';

export function ProjectForm({
  project,
  onSave,
  onCancel,
}: {
  project: Project | null;
  onSave: (input: ProjectInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[6]);
  const [progress, setProgress] = useState(Math.round(project?.progress ?? 0));
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'cola');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      name: trimmed,
      description: description.trim(),
      color,
      progress: status === 'hecho' ? 100 : progress,
      status: progress >= 100 ? 'hecho' : status,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal form" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label="Proyecto">
        <h3>{project ? 'Editar proyecto' : 'Nuevo proyecto'}</h3>
        <label>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
        </label>
        <label>
          Descripción
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={400} />
        </label>
        <fieldset className="colors">
          <legend>Color</legend>
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color ${c === color ? 'is-active' : ''}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
            />
          ))}
        </fieldset>
        <div className="form-row">
          <label>
            Estado
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              <option value="cola">En cola</option>
              <option value="curso">En curso</option>
              <option value="hecho">Hecho</option>
            </select>
          </label>
          <label>
            Progreso: {status === 'hecho' ? 100 : progress}%
            <input
              type="range"
              min={0}
              max={100}
              value={status === 'hecho' ? 100 : progress}
              disabled={status === 'hecho'}
              onChange={(e) => setProgress(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-accent" disabled={!name.trim()}>
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
