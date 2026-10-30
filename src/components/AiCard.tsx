import type { AiStatus } from '../../shared/types.ts';
import { api } from '../net/api.ts';

// Proveedor de IA, consumo de hoy y piloto automático del CEO.

const PROVIDER_LABEL: Record<string, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  anthropic: 'Claude',
  simulado: 'Simulado',
};

function money(n: number) {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: n < 0.1 ? 3 : 2 })} $`;
}

export function AiCard({ ai, open }: { ai: AiStatus; open: boolean }) {
  const label = PROVIDER_LABEL[ai.provider] ?? ai.provider;
  const callPct = Math.min(100, (ai.callsToday / Math.max(1, ai.callLimit)) * 100);
  const spendPct = Math.min(100, (ai.spentToday / Math.max(0.0001, ai.spendLimit)) * 100);
  return (
    <section className={`card card-ai ${open ? 'is-open' : ''}`} aria-label="Inteligencia artificial">
      <div className="ai-head">
        <span className={`ai-dot ${ai.mode === 'ia' ? 'is-on' : ''}`} />
        {ai.mode === 'ia' ? (
          <span className="ai-name">
            IA: <strong>{label}</strong> · {ai.model}
          </span>
        ) : (
          <span className="ai-name">IA sin configurar: simulación</span>
        )}
      </div>
      {ai.mode === 'simulado' ? (
        <p className="ai-note">{ai.reason}. Mientras tanto, el equipo finge trabajar como en la fase 1.</p>
      ) : (
        <>
          <div className="ai-usage">
            <div>
              <span>
                Hoy: {ai.callsToday}/{ai.callLimit} llamadas
              </span>
              <div className="mini-bar">
                <span style={{ width: `${callPct}%`, background: callPct > 85 ? 'var(--danger)' : 'var(--accent)' }} />
              </div>
            </div>
            <div>
              <span>
                Gasto: {money(ai.spentToday)} de {money(ai.spendLimit)}
              </span>
              <div className="mini-bar">
                <span style={{ width: `${spendPct}%`, background: spendPct > 85 ? 'var(--danger)' : 'var(--gold)' }} />
              </div>
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={ai.autopilot}
              onChange={(e) => {
                api.control({ autopilot: e.target.checked }).catch(() => undefined);
              }}
            />
            <span className="switch-ui" aria-hidden="true" />
            <span>
              Piloto automático <em>(Álex reparte trabajo cada {ai.rhythmMin} min)</em>
            </span>
          </label>
          {ai.planning && <p className="ai-note">Álex está pensando prioridades…</p>}
          {ai.blocked && <p className="ai-warn">{ai.blocked}</p>}
        </>
      )}
    </section>
  );
}
