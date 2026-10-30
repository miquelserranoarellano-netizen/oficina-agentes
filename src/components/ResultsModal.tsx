import { useEffect, useState } from 'react';
import { AGENTS } from '../../shared/data.ts';
import type { Project, ResultInfo } from '../../shared/types.ts';
import { api, errorText } from '../net/api.ts';
import { Markdown, stripFrontMatter } from './Markdown.tsx';

// Lista de lo que han entregado los agentes para un proyecto, y lector de cada resultado.

export function ResultsModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [list, setList] = useState<ResultInfo[] | null>(null);
  const [open, setOpen] = useState<{ title: string; file: string; text: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .results(project.id)
      .then((r) => setList(r.results))
      .catch((err) => setError(errorText(err)));
  }, [project.id]);

  const show = (r: ResultInfo) => {
    setError('');
    api
      .result(r.taskId)
      .then((res) => setOpen({ title: res.title, file: res.file, text: res.text }))
      .catch((err) => setError(errorText(err)));
  };

  const doc = open ? stripFrontMatter(open.text) : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal results" role="dialog" aria-modal="true" aria-label={`Resultados de ${project.name}`} onClick={(e) => e.stopPropagation()}>
        <h3>{open ? open.title : `Resultados · ${project.name}`}</h3>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {open && doc ? (
          <>
            <p className="result-file">
              <code>{open.file}</code>
            </p>
            <div className="result-body">
              <Markdown text={doc.body} />
            </div>
          </>
        ) : list === null ? (
          !error && <p className="muted">Cargando…</p>
        ) : list.length === 0 ? (
          <p className="muted">Todavía no hay resultados. Aparecerán aquí cuando un agente termine una tarea con IA.</p>
        ) : (
          <ul className="result-list">
            {list.map((r) => {
              const agent = AGENTS.find((a) => a.id === r.agentId);
              return (
                <li key={r.taskId}>
                  <button type="button" className="result-item" onClick={() => show(r)}>
                    <span className="result-title">{r.title}</span>
                    <span className="result-meta">
                      <span style={{ color: agent?.color }}>{agent?.name}</span> ·{' '}
                      {new Date(r.at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {r.summary && <span className="result-summary">{r.summary}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-actions">
          {open && (
            <button type="button" className="btn" onClick={() => setOpen(null)}>
              Volver
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
