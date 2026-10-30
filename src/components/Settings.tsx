import { useState, type FormEvent } from 'react';
import { api, errorText, type SessionInfo } from '../net/api.ts';

// Ajustes: verificación en dos pasos (TOTP) y cierre de sesión.

export function Settings({
  session,
  onChange,
  onLogout,
  onClose,
}: {
  session: SessionInfo;
  onChange: (s: SessionInfo) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    act(async () => {
      const res = await api.setup2fa();
      setSetup({ secret: res.secret, qr: res.qr });
      setCode('');
    });

  const enable = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await api.enable2fa(code);
      setSetup(null);
      setCode('');
      setNotice('Verificación en dos pasos activada. A partir de ahora se pedirá el código al entrar.');
      onChange({ ...session, totpEnabled: true });
    });
  };

  const disable = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await api.disable2fa(password, code);
      setPassword('');
      setCode('');
      setNotice('Verificación en dos pasos desactivada.');
      onChange({ ...session, totpEnabled: false });
    });
  };

  const codeInput = (
    <label>
      Código de 6 cifras
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        required
      />
    </label>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal form settings" role="dialog" aria-modal="true" aria-label="Ajustes" onClick={(e) => e.stopPropagation()}>
        <h3>Ajustes</h3>
        <p className="settings-user">
          Sesión iniciada como <strong>{session.username}</strong>
        </p>

        <section className="settings-block">
          <h4>Verificación en dos pasos</h4>
          <p className={`twofa-state ${session.totpEnabled ? 'is-on' : ''}`}>
            {session.totpEnabled ? 'Activada' : 'Desactivada'}
          </p>

          {!session.totpEnabled && !setup && (
            <>
              <p className="muted">
                Además de la contraseña, se pedirá un código de Google Authenticator (o cualquier app TOTP) al entrar.
              </p>
              <button type="button" className="btn btn-accent" onClick={start} disabled={busy}>
                Activar
              </button>
            </>
          )}

          {setup && (
            <form onSubmit={enable}>
              <ol className="steps">
                <li>Abre Google Authenticator y pulsa «+» → «Escanear un código QR».</li>
                <li>Escanea este código (o escribe la clave a mano).</li>
                <li>Escribe aquí el código de 6 cifras que aparece.</li>
              </ol>
              <img className="qr" src={setup.qr} alt="Código QR para la app de autenticación" />
              <p className="secret">
                Clave: <code>{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
              </p>
              {codeInput}
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setSetup(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-accent" disabled={busy || code.length !== 6}>
                  Confirmar
                </button>
              </div>
            </form>
          )}

          {session.totpEnabled && (
            <form onSubmit={disable}>
              <p className="muted">Para desactivarla, confirma tu contraseña y un código actual.</p>
              <label>
                Contraseña
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </label>
              {codeInput}
              <div className="modal-actions">
                <button type="submit" className="btn btn-danger" disabled={busy || code.length !== 6 || !password}>
                  Desactivar
                </button>
              </div>
            </form>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && <p className="form-ok">{notice}</p>}
        </section>

        <div className="modal-actions settings-foot">
          <button type="button" className="btn btn-danger" onClick={onLogout}>
            Cerrar sesión
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
