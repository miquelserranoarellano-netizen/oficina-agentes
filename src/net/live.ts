import type { ChatMessage, Frame, ServerMessage, Snapshot } from '../../shared/types.ts';
import { ApiError, api } from './api.ts';

// Conexión en tiempo real con la oficina del servidor. Reconecta sola si se cae.

export type LinkStatus = 'conectando' | 'conectado' | 'reconectando';

export interface LiveState {
  snapshot: Snapshot | null;
  status: LinkStatus;
}

export interface TimedFrame {
  /** Momento de llegada (performance.now). */
  at: number;
  frame: Frame;
}

const MAX_FRAMES = 30;
const LOG_KEEP = 150;

export class LiveStore {
  frames: TimedFrame[] = [];
  /** Se llama si el servidor dice que la sesión ya no vale. */
  onUnauthorized?: () => void;

  private state: LiveState = { snapshot: null, status: 'conectando' };
  private listeners = new Set<() => void>();
  private chatListeners = new Set<(m: ChatMessage) => void>();

  /** Mensajes de chat nuevos (de cualquier conversación). */
  onChat(fn: (m: ChatMessage) => void) {
    this.chatListeners.add(fn);
    return () => {
      this.chatListeners.delete(fn);
    };
  }
  private ws?: WebSocket;
  private stopped = true;
  private retry = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = () => this.state;

  connect() {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  disconnect() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.ws?.close(1000);
    this.ws = undefined;
    this.frames = [];
    this.set({ snapshot: null, status: 'conectando' });
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      this.retry = 0;
      this.set({ ...this.state, status: 'conectado' });
    };
    ws.onmessage = (ev) => {
      try {
        this.handle(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        // mensaje dañado: se ignora
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws || this.stopped) return;
      if (ev.code === 4401) {
        this.onUnauthorized?.();
        return;
      }
      this.set({ ...this.state, status: 'reconectando' });
      // Si ni siquiera llegó a abrirse puede ser falta de sesión: se comprueba antes de reintentar.
      const check = opened ? Promise.resolve() : api.session().then(() => undefined);
      check
        .then(() => this.scheduleRetry())
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) this.onUnauthorized?.();
          else this.scheduleRetry();
        });
    };
  }

  private scheduleRetry() {
    if (this.stopped) return;
    const delay = Math.min(10_000, 500 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private handle(msg: ServerMessage) {
    switch (msg.type) {
      case 'frame':
        this.frames.push({ at: performance.now(), frame: msg.frame });
        if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
        break;
      case 'snapshot': {
        const log = msg.full ? msg.snapshot.log : (this.state.snapshot?.log ?? []);
        this.set({ ...this.state, snapshot: { ...msg.snapshot, log } });
        break;
      }
      case 'log': {
        const snap = this.state.snapshot;
        if (!snap || snap.log.some((e) => e.id === msg.entry.id)) break;
        this.set({ ...this.state, snapshot: { ...snap, log: [msg.entry, ...snap.log].slice(0, LOG_KEEP) } });
        break;
      }
      case 'chat':
        for (const fn of this.chatListeners) fn(msg.message);
        break;
    }
  }

  private set(next: LiveState) {
    this.state = next;
    for (const fn of this.listeners) fn();
  }
}

export const live = new LiveStore();
