import type { WebSocket } from '@fastify/websocket';
import { AGENTS, INITIAL_PROJECTS } from '../shared/data.ts';
import type { AgentId, AiStatus, ChatMessage, Project, ServerMessage, Snapshot, Speed, Task } from '../shared/types.ts';
import { OfficeWorld } from '../shared/world.ts';
import { AiBrain } from './agents/brain.ts';
import { config } from './config.ts';
import type { Store } from './db.ts';
import { LlmService } from './llm/index.ts';

// La oficina viva en el servidor: avanza el mundo, lo guarda en SQLite y lo emite por WebSocket.

const TICK_MS = 50;
const FRAME_EVERY = 2; // 10 fotogramas por segundo
const SAVE_EVERY_MS = 5000;

interface Client {
  socket: WebSocket;
  tokenHash: string;
}

export class ChatBusyError extends Error {}

function exampleProjects(): Project[] {
  return INITIAL_PROJECTS.map((p) => ({ ...p }));
}

/** Dos tareas a medias para que la primera vez la oficina arranque con gente trabajando. */
function exampleTasks(): Task[] {
  const base = { status: 'en-curso' as const, duration: 22, gain: 6, createdAt: Date.now(), source: 'simulada' as const };
  return [
    { ...base, id: 'inicio-ivan', projectId: 'reels', agentId: 'ivan', title: 'Guion del próximo reel de curiosidades', progress: 0.35 },
    { ...base, id: 'inicio-leo', projectId: 'smart-fitness-coach-app', agentId: 'leo', title: 'Fase 6: Inicio y Nutrición reales', progress: 0.5 },
  ];
}

export class OfficeService {
  readonly world: OfficeWorld;
  readonly llm: LlmService;
  private brain?: AiBrain;
  private store: Store;
  private clients = new Set<Client>();
  private chatBusy = new Set<AgentId>();
  private timer?: ReturnType<typeof setInterval>;
  private ticks = 0;
  private lastTick = performance.now();
  private lastSave = 0;
  private lastSnapshot = 0;
  private pendingSnapshot = false;

  constructor(store: Store) {
    this.store = store;
    this.llm = new LlmService(store);
    if (this.llm.main().ready) this.brain = new AiBrain(store, this.llm);
    let projects = store.loadProjects();
    let active = store.activeTasks();
    if (store.getMeta('seeded') !== '1') {
      projects = exampleProjects();
      active = exampleTasks();
      store.saveProjects(projects);
      for (const t of active) store.saveTask(t);
      store.setMeta('seeded', '1');
    }
    const { paused, speed, autopilot } = store.getSettings();
    this.world = new OfficeWorld({
      projects,
      log: store.recentActivity(150),
      activeTasks: active,
      paused,
      speed,
      autopilot,
      rhythmMin: config.llm.rhythmMin,
      ai: this.brain,
      hooks: {
        log: (entry) => {
          store.addActivity(entry);
          this.broadcast({ type: 'log', entry });
        },
        task: (task) => store.saveTask(task),
        projectsChanged: (list) => store.saveProjects(list),
      },
    });
  }

  start() {
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.loop(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.save();
    for (const c of this.clients) c.socket.close(1001, 'Servidor detenido');
  }

  aiStatus(): AiStatus {
    const main = this.llm.main();
    const { calls, spent } = this.llm.today();
    return {
      mode: main.ready ? 'ia' : 'simulado',
      provider: main.provider,
      model: main.model,
      reason: main.reason,
      autopilot: this.world.autopilot,
      rhythmMin: config.llm.rhythmMin,
      callsToday: calls,
      callLimit: config.llm.callLimit,
      spentToday: Math.round(spent * 10000) / 10000,
      spendLimit: config.llm.spendLimit,
      blocked: main.ready ? (this.llm.blocked() ?? this.world.aiNotice) : undefined,
      planning: this.world.planning,
    };
  }

  snapshot(withLog: boolean): Snapshot {
    return { ...this.world.snapshot(withLog), ai: this.aiStatus() };
  }

  /* ---------- órdenes desde la API ---------- */

  control(paused?: boolean, speed?: Speed, autopilot?: boolean) {
    if (paused !== undefined) this.world.setPaused(paused);
    if (speed !== undefined) this.world.setSpeed(speed);
    if (autopilot !== undefined) this.world.setAutopilot(autopilot);
    this.store.saveSettings(this.world.paused, this.world.speed, this.world.autopilot);
    this.pushSnapshot();
  }

  resetDemo() {
    this.world.reset(exampleProjects());
    this.pushSnapshot();
  }

  /** Tras crear, editar o borrar: que todos lo vean ya. */
  pushSnapshot() {
    this.world.takeDirty();
    this.pendingSnapshot = false;
    this.lastSnapshot = performance.now();
    this.broadcast({ type: 'snapshot', snapshot: this.snapshot(false), full: false });
  }

  /* ---------- chat ---------- */

  /** Guarda el mensaje de Miquel y lanza la respuesta del agente (llega por WebSocket). */
  chat(agentId: AgentId, projectId: string | null, text: string): ChatMessage {
    if (this.chatBusy.has(agentId)) throw new ChatBusyError();
    const project = projectId ? (this.world.projects.find((p) => p.id === projectId) ?? null) : null;
    const pid = project?.id ?? null;
    const userMsg = this.store.addChat({ at: Date.now(), agentId, projectId: pid, role: 'user', text });
    this.broadcast({ type: 'chat', message: userMsg });

    const answer = (reply: string, error = false) => {
      const msg = this.store.addChat({ at: Date.now(), agentId, projectId: pid, role: 'agent', text: reply, error });
      this.broadcast({ type: 'chat', message: msg });
      this.world.chatReply(agentId, error ? reply.split(' (')[0] : reply);
      this.pushSnapshot();
    };

    const brain = this.brain;
    if (!brain) {
      answer(`Ahora mismo no tengo IA configurada (${this.llm.main().reason}). Cuando la tenga, te contesto de verdad.`, true);
      return userMsg;
    }
    this.chatBusy.add(agentId);
    this.world.setTyping(agentId, true);
    this.pushSnapshot();
    brain
      .chat(agentId, project, this.world.projects, this.teamState())
      .then(({ reply, items }) => {
        answer(reply);
        // Lo que el CEO decide en el chat pasa a su cola y lo reparte en la oficina.
        if (items.length) this.world.addPlanned(items, 'chat');
      })
      .catch((err) => {
        const f = brain.describe(err);
        this.world.setTyping(agentId, false);
        answer(`${f.bubble} (${f.message})`, true);
      })
      .finally(() => this.chatBusy.delete(agentId));
    return userMsg;
  }

  private teamState(): string {
    const snap = this.world.snapshot(false);
    const lines = snap.agents
      .filter((a) => a.role !== 'CEO')
      .map((a) => `- ${a.name} (${a.id}, ${a.roleName}): ${a.activity === 'trabajando' ? `trabajando en ${a.detail}` : a.activity}`);
    const queued = snap.tasks
      .filter((t) => t.status === 'pendiente')
      .map((t) => `- En cola: «${t.title}» para ${AGENTS.find((x) => x.id === t.agentId)?.name} (${t.projectId})`);
    return [...lines, ...queued].join('\n');
  }

  /* ---------- clientes ---------- */

  addClient(socket: WebSocket, tokenHash: string) {
    const client = { socket, tokenHash };
    this.clients.add(client);
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
    // Los mensajes del navegador se ignoran: las órdenes van por la API.
    socket.on('message', () => undefined);
    this.send(socket, { type: 'snapshot', snapshot: this.snapshot(true), full: true });
    this.send(socket, { type: 'frame', frame: this.world.frame() });
  }

  /** Cierra los WebSocket de una sesión (al salir) o los que ya no tengan sesión válida. */
  closeSessions(isValid: (tokenHash: string) => boolean) {
    for (const c of this.clients) {
      if (!isValid(c.tokenHash)) {
        c.socket.close(4401, 'Sesión cerrada');
        this.clients.delete(c);
      }
    }
  }

  /* ---------- bucle ---------- */

  private loop() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.world.tick(dt);
    this.ticks++;

    if (this.clients.size) {
      if (this.ticks % FRAME_EVERY === 0 && (!this.world.paused || this.ticks % 20 === 0)) {
        this.broadcast({ type: 'frame', frame: this.world.frame() });
      }
      if (this.world.takeDirty()) this.pendingSnapshot = true;
      const progressDue = this.world.isAnyoneWorking() && now - this.lastSnapshot > 1000;
      if ((this.pendingSnapshot && now - this.lastSnapshot > 150) || progressDue) {
        this.pendingSnapshot = false;
        this.lastSnapshot = now;
        this.broadcast({ type: 'snapshot', snapshot: this.snapshot(false), full: false });
      }
    }

    if (now - this.lastSave > SAVE_EVERY_MS) {
      this.lastSave = now;
      this.save();
    }
  }

  private save() {
    this.store.saveProjects(this.world.projects);
    for (const t of this.world.tasks) if (t.status === 'en-curso') this.store.saveTask(t);
  }

  private broadcast(msg: ServerMessage) {
    if (!this.clients.size) return;
    const data = JSON.stringify(msg);
    for (const c of this.clients) if (c.socket.readyState === 1) c.socket.send(data);
  }

  private send(socket: WebSocket, msg: ServerMessage) {
    if (socket.readyState === 1) socket.send(JSON.stringify(msg));
  }
}
