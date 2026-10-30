import { api } from '../net/api.ts';
import type { LinkStatus } from '../net/live.ts';
import type { Snapshot, Speed } from '../../shared/types.ts';

const SPEEDS: Speed[] = [1, 2, 4];

const LINK_LABEL: Record<LinkStatus, string> = {
  conectando: 'Conectando…',
  conectado: 'En directo',
  reconectando: 'Reconectando…',
};

export function Controls({
  snap,
  status,
  onSettings,
}: {
  snap: Snapshot | null;
  status: LinkStatus;
  onSettings: () => void;
}) {
  const send = (body: { paused?: boolean; speed?: Speed }) => {
    api.control(body).catch(() => undefined);
  };
  return (
    <div className="controls">
      <span className={`link link-${status}`} title={LINK_LABEL[status]}>
        <span className="link-dot" />
        <span className="link-text">{LINK_LABEL[status]}</span>
      </span>
      <button
        type="button"
        className={`btn btn-play ${snap?.paused ? 'is-paused' : ''}`}
        onClick={() => snap && send({ paused: !snap.paused })}
        disabled={!snap}
        aria-label={snap?.paused ? 'Reanudar' : 'Pausar'}
        title={snap?.paused ? 'Reanudar' : 'Pausar'}
      >
        {snap?.paused ? '▶' : '❚❚'}
      </button>
      <div className="speed" role="group" aria-label="Velocidad">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn btn-speed ${snap?.speed === s ? 'is-active' : ''}`}
            aria-pressed={snap?.speed === s}
            disabled={!snap}
            onClick={() => send({ speed: s })}
          >
            x{s}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-icon" onClick={onSettings} aria-label="Ajustes" title="Ajustes">
        ⚙
      </button>
    </div>
  );
}
