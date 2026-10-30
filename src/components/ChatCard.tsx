import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AGENTS } from '../../shared/data.ts';
import type { AgentId, ChatMessage, Snapshot } from '../../shared/types.ts';
import { api, errorText } from '../net/api.ts';
import { live } from '../net/live.ts';
import { portrait } from '../office/sprites.ts';
import { Markdown } from './Markdown.tsx';

// Chat con el CEO (que reparte el trabajo) o con un agente concreto, por proyecto o en general.

export function ChatCard({ snap, open }: { snap: Snapshot; open: boolean }) {
  const [agentId, setAgentId] = useState<AgentId>('alex');
  const [projectId, setProjectId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const faces = useMemo(() => Object.fromEntries(AGENTS.map((a) => [a.id, portrait(a.id, a.look)])), []);
  const agent = AGENTS.find((a) => a.id === agentId)!;
  const typing = snap.typing.includes(agentId);
  const pid = projectId || null;

  // Historial de la conversación elegida.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api
      .chatHistory(agentId, pid)
      .then((r) => alive && setMessages(r.messages))
      .catch((err) => alive && setError(errorText(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [agentId, pid]);

  // Mensajes nuevos en directo (de esta conversación).
  useEffect(
    () =>
      live.onChat((m) => {
        if (m.agentId !== agentId || m.projectId !== pid) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      }),
    [agentId, pid],
  );

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  // Si se borra el proyecto elegido, se vuelve a la conversación general.
  useEffect(() => {
    if (projectId && !snap.projects.some((p) => p.id === projectId)) setProjectId('');
  }, [snap.projects, projectId]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError('');
    try {
      const { message } = await api.sendChat(agentId, pid, body);
      setText('');
      setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev : [...prev, message]));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section className={`card card-chat ${open ? 'is-open' : ''}`} aria-label="Chat">
      <div className="chat-contacts" role="tablist" aria-label="Con quién hablar">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === agentId}
            className={`contact ${a.id === agentId ? 'is-active' : ''}`}
            onClick={() => setAgentId(a.id)}
            title={`${a.name} · ${a.roleName}`}
          >
            <img src={faces[a.id]} alt="" style={{ borderColor: a.color }} />
            <span>{a.name}</span>
            {snap.typing.includes(a.id) && <i className="contact-typing" aria-label="escribiendo" />}
          </button>
        ))}
      </div>

      <div className="chat-bar">
        <span className="chat-who" style={{ color: agent.color }}>
          {agent.name} <em>{agent.role === 'CEO' ? 'reparte el trabajo al equipo' : agent.roleName}</em>
        </span>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Proyecto de la conversación">
          <option value="">General</option>
          {snap.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {snap.ai.mode === 'simulado' && (
        <p className="ai-note">Sin IA configurada: los agentes no pueden contestar todavía ({snap.ai.reason}).</p>
      )}

      <div className="chat-list" ref={listRef} aria-live="polite">
        {loading && <p className="muted">Cargando…</p>}
        {!loading && messages.length === 0 && (
          <p className="muted chat-empty">
            {agent.role === 'CEO'
              ? 'Pídele a Álex lo que quieras: él decide quién lo hace y se lo encarga en la oficina.'
              : `Habla directamente con ${agent.name}.`}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role} ${m.error ? 'msg-error' : ''}`}>
            {m.role === 'agent' && <img className="msg-face" src={faces[m.agentId]} alt="" />}
            <div className="msg-bubble" style={m.role === 'agent' ? { borderColor: agent.color } : undefined}>
              {m.role === 'agent' ? <Markdown text={m.text} /> : <p>{m.text}</p>}
              <time>{new Date(m.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
          </div>
        ))}
        {typing && (
          <div className="msg msg-agent">
            <img className="msg-face" src={faces[agentId]} alt="" />
            <div className="msg-bubble typing" style={{ borderColor: agent.color }}>
              {agent.name} está escribiendo<span className="dots" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <form className="chat-form" onSubmit={send}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          maxLength={2000}
          placeholder={`Escribe a ${agent.name}…`}
          aria-label={`Mensaje para ${agent.name}`}
        />
        <button type="submit" className="btn btn-accent" disabled={!text.trim() || typing}>
          Enviar
        </button>
      </form>
    </section>
  );
}
