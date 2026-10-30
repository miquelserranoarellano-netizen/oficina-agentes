import { useMemo, useState, type FormEvent } from 'react';
import { AGENTS } from '../../shared/data.ts';
import { api, errorText, type SessionInfo } from '../net/api.ts';
import { portrait } from '../office/sprites.ts';

export function Login({ needsUser, onLoggedIn }: { needsUser: boolean; onLoggedIn: (s: SessionInfo) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const faces = useMemo(() => AGENTS.map((a) => ({ id: a.id, src: portrait(a.id, a.look), color: a.color })), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (ticket) {
        onLoggedIn(await api.loginTotp(ticket, code));
        return;
      }
      const res = await api.login(username, password);
      if ('needTotp' in res) {
        setTicket(res.ticket);
        setPassword('');
      } else {
        onLoggedIn(res);
      }
    } catch (err) {
      setError(errorText(err));
      if (ticket && /caducado/.test(errorText(err))) {
        setTicket(null);
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit} aria-label="Iniciar sesión">
        <div className="login-faces" aria-hidden="true">
          {faces.map((f) => (
            <img key={f.id} src={f.src} alt="" style={{ borderColor: f.color }} />
          ))}
        </div>
        <h1>Oficina de Miquel</h1>
        <p className="login-sub">{ticket ? 'Escribe el código de tu app de autenticación.' : 'Inicia sesión para entrar.'}</p>

        {needsUser && !ticket && (
          <p className="login-note">
            Todavía no hay ningún usuario. Créalo en el ordenador donde corre el servidor con <code>npm run crear-usuario</code>.
          </p>
        )}

        {!ticket ? (
          <>
            <label>
              Usuario
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          </>
        ) : (
          <label>
            Código de 6 cifras
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              required
              autoFocus
            />
          </label>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="login-actions">
          {ticket && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setTicket(null);
                setCode('');
                setError('');
              }}
            >
              Volver
            </button>
          )}
          <button type="submit" className="btn btn-accent" disabled={busy}>
            {busy ? 'Entrando…' : ticket ? 'Verificar' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  );
}
