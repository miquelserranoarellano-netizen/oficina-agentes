import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AiCard } from './components/AiCard.tsx';
import { ChatCard } from './components/ChatCard.tsx';
import { Controls } from './components/Controls.tsx';
import { Login } from './components/Login.tsx';
import { OfficeCanvas } from './components/OfficeCanvas.tsx';
import { LogCard, ProjectsCard, Tabs, TeamCard, type Tab } from './components/Panel.tsx';
import { Settings } from './components/Settings.tsx';
import { ApiError, api, type SessionInfo } from './net/api.ts';
import { live } from './net/live.ts';

type AuthState =
  | { kind: 'cargando' }
  | { kind: 'sin-servidor' }
  | { kind: 'fuera'; needsUser: boolean }
  | { kind: 'dentro'; session: SessionInfo };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: 'cargando' });

  const checkSession = useCallback(() => {
    setAuth({ kind: 'cargando' });
    api
      .session()
      .then((session) => setAuth({ kind: 'dentro', session }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setAuth({ kind: 'fuera', needsUser: !!err.data.needsUser });
        else setAuth({ kind: 'sin-servidor' });
      });
  }, []);

  useEffect(checkSession, [checkSession]);
  const loggedOut = useCallback(() => setAuth({ kind: 'fuera', needsUser: false }), []);
  const sessionChanged = useCallback((session: SessionInfo) => setAuth({ kind: 'dentro', session }), []);

  if (auth.kind === 'cargando') return <div className="splash">Cargando…</div>;
  if (auth.kind === 'sin-servidor') {
    return (
      <div className="splash">
        <p>No se puede conectar con el servidor de la oficina.</p>
        <button type="button" className="btn btn-accent" onClick={checkSession}>
          Reintentar
        </button>
      </div>
    );
  }
  if (auth.kind === 'fuera') {
    return <Login needsUser={auth.needsUser} onLoggedIn={sessionChanged} />;
  }
  return <Office session={auth.session} onSession={sessionChanged} onLoggedOut={loggedOut} />;
}

function Office({
  session,
  onSession,
  onLoggedOut,
}: {
  session: SessionInfo;
  onSession: (s: SessionInfo) => void;
  onLoggedOut: () => void;
}) {
  const { snapshot: snap, status } = useSyncExternalStore(live.subscribe, live.getState);
  const [tab, setTab] = useState<Tab>('equipo');
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    live.onUnauthorized = () => {
      live.disconnect();
      onLoggedOut();
    };
    live.connect();
    return () => {
      live.onUnauthorized = undefined;
      live.disconnect();
    };
  }, [onLoggedOut]);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      live.disconnect();
      onLoggedOut();
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true" />
          <div>
            <h1>Oficina de Miquel</h1>
            <p className="brand-sub">
              {snap?.ai.mode === 'ia' ? 'Equipo de agentes con IA' : 'Agentes simulados (sin IA configurada)'}
            </p>
          </div>
        </div>
        <Controls snap={snap} status={status} onSettings={() => setSettings(true)} />
      </header>
      {snap ? (
        <main className="layout">
          <div className="col-main">
            <section className="office-pane" aria-label="Oficina">
              <OfficeCanvas projectIds={snap.projects.map((p) => p.id)} />
            </section>
            <Tabs tab={tab} onTab={setTab} />
            <LogCard snap={snap} open={tab === 'actividad'} />
          </div>
          <div className={`col-side ${tab === 'chat' ? 'is-chat' : ''}`}>
            <div className="side-switch" role="tablist" aria-label="Panel">
              <button
                type="button"
                role="tab"
                aria-selected={tab !== 'chat'}
                className={`tab ${tab !== 'chat' ? 'is-active' : ''}`}
                onClick={() => setTab('equipo')}
              >
                Equipo y proyectos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'chat'}
                className={`tab ${tab === 'chat' ? 'is-active' : ''}`}
                onClick={() => setTab('chat')}
              >
                Chat
              </button>
            </div>
            <AiCard ai={snap.ai} open={tab === 'equipo'} />
            <TeamCard snap={snap} open={tab === 'equipo'} />
            <ProjectsCard snap={snap} open={tab === 'proyectos'} />
            <ChatCard snap={snap} open={tab === 'chat'} />
          </div>
        </main>
      ) : (
        <div className="splash">Conectando con la oficina…</div>
      )}
      {settings && (
        <Settings session={session} onChange={onSession} onLogout={logout} onClose={() => setSettings(false)} />
      )}
    </div>
  );
}
