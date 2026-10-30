import { useMemo, useState } from 'react';
import { AGENTS } from '../../shared/data.ts';
import type { AgentActivity, Project, ProjectInput, ProjectStatus, Snapshot } from '../../shared/types.ts';
import { api, errorText } from '../net/api.ts';
import { portrait } from '../office/sprites.ts';
import { ProjectForm } from './ProjectForm.tsx';
import { ResultsModal } from './ResultsModal.tsx';

// Tarjetas del panel: equipo, proyectos y actividad. En el móvil se ven de una en una con pestañas.

export type Tab = 'equipo' | 'proyectos' | 'chat' | 'actividad';

const TAB_LABEL: Record<Tab, string> = {
  equipo: 'Equipo',
  proyectos: 'Proyectos',
  chat: 'Chat',
  actividad: 'Actividad',
};

const ACTIVITY_LABEL: Record<AgentActivity, string> = {
  despacho: 'En su despacho',
  planificando: 'Planificando',
  repartiendo: 'Repartiendo tareas',
  escuchando: 'Escuchando',
  yendo: 'Caminando',
  trabajando: 'Trabajando',
  cafe: 'En el café',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  cola: 'En cola',
  curso: 'En curso',
  hecho: 'Hecho',
};

export function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabs" role="tablist">
      {(['equipo', 'proyectos', 'chat', 'actividad'] as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          className={`tab ${tab === t ? 'is-active' : ''}`}
          onClick={() => onTab(t)}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </nav>
  );
}

export function TeamCard({ snap, open }: { snap: Snapshot; open: boolean }) {
  const portraits = useMemo(() => Object.fromEntries(AGENTS.map((a) => [a.id, portrait(a.id, a.look)])), []);
  return (
    <section className={`card card-team ${open ? 'is-open' : ''}`} aria-label="Equipo">
      <h2 className="card-title">Equipo</h2>
      <ul className="agents">
        {snap.agents.map((a) => {
          const task = snap.tasks.find((t) => t.agentId === a.id && t.status === 'en-curso');
          return (
            <li key={a.id} className={`agent act-${a.activity}`}>
              <img className="agent-face" src={portraits[a.id]} alt="" style={{ borderColor: a.color }} />
              <div className="agent-body">
                <div className="agent-head">
                  <span className="agent-name">{a.name}</span>
                  <span className="role-tag" style={{ background: a.color }} title={a.roleName}>
                    {a.role}
                  </span>
                  <span className="agent-state">
                    <span className="dot" />
                    {ACTIVITY_LABEL[a.activity]}
                  </span>
                </div>
                <div className="agent-detail" title={a.detail}>
                  {snap.typing.includes(a.id) ? 'Escribiendo en el chat…' : a.detail}
                </div>
                {task && (
                  <div className="mini-bar" aria-label={`Tarea al ${Math.round(task.progress * 100)}%`}>
                    <span style={{ width: `${task.progress * 100}%`, background: a.color }} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ProjectsCard({ snap, open }: { snap: Snapshot; open: boolean }) {
  const [editing, setEditing] = useState<Project | 'nuevo' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [results, setResults] = useState<Project | null>(null);
  const [error, setError] = useState('');

  /** Ejecuta una orden en el servidor; el resultado llega por el WebSocket. */
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  };

  const save = async (input: ProjectInput) => {
    const target = editing;
    const ok = await run(() => (target === 'nuevo' || !target ? api.addProject(input) : api.updateProject(target.id, input)));
    if (ok) setEditing(null);
  };

  return (
    <section className={`card card-projects ${open ? 'is-open' : ''}`} aria-label="Proyectos">
      <div className="card-head">
        <h2 className="card-title">Proyectos</h2>
        <button type="button" className="btn btn-small btn-accent" onClick={() => setEditing('nuevo')}>
          + Añadir
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ul className="projects">
        {snap.projects.map((p) => {
          const worker = snap.agents.find((a) => a.projectId === p.id);
          const queued = snap.tasks.filter((t) => t.projectId === p.id && t.status === 'pendiente');
          return (
            <li key={p.id} className={`project st-${p.status}`} style={{ ['--pc' as string]: p.color }}>
              <div className="project-head">
                <span className="swatch" />
                <span className="project-name">{p.name}</span>
                <span className={`status status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
              </div>
              <div className="bar" aria-label={`Progreso ${Math.floor(p.progress)}%`}>
                <span style={{ width: `${p.progress}%` }} />
                <em>{Math.floor(p.progress)}%</em>
              </div>
              <p className="project-desc">{p.description || 'Sin descripción.'}</p>
              {queued.length > 0 && (
                <ul className="queued">
                  {queued.map((t) => (
                    <li key={t.id}>
                      En cola: «{t.title}» para {AGENTS.find((a) => a.id === t.agentId)?.name}
                    </li>
                  ))}
                </ul>
              )}
              <div className="project-foot">
                <span className="project-who">
                  {worker ? (
                    <>
                      <span className="who-dot" style={{ background: worker.color }} />
                      {worker.name} {worker.activity === 'trabajando' ? 'trabajando' : 'de camino'}
                    </>
                  ) : (
                    'Nadie ahora mismo'
                  )}
                </span>
                <span className="project-actions">
                  <button type="button" className="btn btn-small" onClick={() => setResults(p)}>
                    Resultados
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setEditing(p)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => setConfirmDelete(p)}>
                    Eliminar
                  </button>
                </span>
              </div>
            </li>
          );
        })}
        {snap.projects.length === 0 && (
          <li className="empty">No hay proyectos. Añade uno para que el equipo se ponga a trabajar.</li>
        )}
      </ul>
      <button type="button" className="btn btn-small btn-ghost reset" onClick={() => setConfirmReset(true)}>
        Reiniciar demo
      </button>

      {editing && (
        <ProjectForm project={editing === 'nuevo' ? null : editing} onCancel={() => setEditing(null)} onSave={save} />
      )}
      {results && <ResultsModal project={results} onClose={() => setResults(null)} />}
      {confirmDelete && (
        <Confirm
          text={`¿Eliminar «${confirmDelete.name}» de la oficina? Solo se quita de la app: tus carpetas no se tocan.`}
          ok="Eliminar"
          onOk={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            void run(() => api.deleteProject(id));
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmReset && (
        <Confirm
          text="¿Volver a los proyectos de ejemplo? Se pierden los cambios que hayas hecho en la lista."
          ok="Reiniciar"
          onOk={() => {
            setConfirmReset(false);
            void run(() => api.reset());
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </section>
  );
}

export function LogCard({ snap, open }: { snap: Snapshot; open: boolean }) {
  return (
    <section className={`card card-log ${open ? 'is-open' : ''}`} aria-label="Actividad">
      <h2 className="card-title">Actividad</h2>
      <ol className="log">
        {snap.log.map((e) => {
          const agent = AGENTS.find((a) => a.id === e.agentId);
          return (
            <li key={e.id} className={`log-item k-${e.kind}`}>
              <time dateTime={new Date(e.at).toISOString()}>{formatTime(e.at)}</time>
              <span className="log-text">
                {agent && <strong style={{ color: agent.color }}>{agent.name} </strong>}
                {e.text}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Hora local; si no es de hoy, también el día. */
function formatTime(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ${time}`;
}

function Confirm({ text, ok, onOk, onCancel }: { text: string; ok: string; onOk: () => void; onCancel: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={onOk} autoFocus>
            {ok}
          </button>
        </div>
      </div>
    </div>
  );
}
