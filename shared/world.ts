import { AGENTS, PHRASES, taskTitleFor } from './data.ts';
import {
  buildLayout,
  findPath,
  isBlocked,
  nearestFree,
  tileAt,
  tileCenter,
  type Layout,
  type Point,
  type Tile,
} from './layout.ts';
import type {
  AgentActivity,
  AgentDef,
  AgentId,
  Bubble,
  Dir,
  Frame,
  LogEntry,
  LogKind,
  Pose,
  Project,
  ProjectInput,
  Snapshot,
  Speed,
  Task,
  WorkerRole,
} from './types.ts';

// Mundo de la oficina sin dibujo: estado, coreografía de los agentes y decisiones del CEO.
// Corre en el servidor; el navegador solo recibe fotogramas y lo pinta.
// Cada agente tiene una cola de acciones (ir a, esperar, decir…) que coreografía lo que se ve.

type Place =
  | { kind: 'desk'; projectId: string }
  | { kind: 'spot'; id: string }
  | { kind: 'ceo' }
  | { kind: 'tile'; tile: Tile; face?: Dir };

interface Dest {
  tile: Tile;
  final?: Point;
  face?: Dir;
  pose: Pose;
}

type Action =
  | { kind: 'goto'; place: Place | (() => Place) }
  | { kind: 'wait'; t: number }
  | { kind: 'say'; text: string; t: number; think?: boolean; block?: boolean }
  | { kind: 'face'; dir: Dir | (() => Dir) }
  | { kind: 'call'; fn: () => void }
  | { kind: 'hold' };

interface Agent {
  def: AgentDef;
  x: number;
  y: number;
  dir: Dir;
  pose: Pose;
  place: Place;
  /** Casilla transitable desde la que sale cuando está sentado. */
  anchor: Tile;
  queue: Action[];
  current?: Action;
  timer: number;
  waypoints: Point[];
  target?: { place: Place; dest: Dest };
  walkDist: number;
  bubble?: Bubble;
  activity: AgentActivity;
  detail: string;
  taskId?: string;
  projectId?: string;
  reserved: boolean;
  idleTimer: number;
  idleSince: number;
  /** Desde cuándo escribe una respuesta del chat (tiempo de simulación). */
  typingSince?: number;
}

/** Avisos al servidor para que guarde en la base de datos. */
export interface WorldHooks {
  log(entry: LogEntry): void;
  task(task: Task): void;
  projectsChanged(projects: Project[]): void;
}

/** Una tarea decidida por el CEO (con IA o desde el chat). */
export interface PlanItem {
  agentId: AgentId;
  projectId: string;
  title: string;
  brief: string;
  gain: number;
}

export interface PlanInput {
  idle: AgentId[];
  open: Project[];
  projects: Project[];
  busy: Array<{ agentId: AgentId; title: string; projectId: string }>;
}

export interface AiFailure {
  kind: string;
  /** Lo que dice el agente en su bocadillo. */
  bubble: string;
  message: string;
}

/** Puente con la IA (lo pone el servidor). Sin él, la oficina simula el trabajo. */
export interface AiBridge {
  plan(input: PlanInput): Promise<PlanItem[]>;
  work(task: Task, project: Project): Promise<{ file: string; summary: string }>;
  describe(err: unknown): AiFailure;
  /** Motivo por el que ahora no se puede llamar a la IA (límite del día, sin cuota…). */
  blocked(): string | undefined;
}

export interface WorldOptions {
  projects: Project[];
  /** Historial reciente (el más nuevo primero). */
  log: LogEntry[];
  /** Tareas pendientes o a medias al apagar el servidor: se retoman. */
  activeTasks: Task[];
  paused: boolean;
  speed: Speed;
  hooks: WorldHooks;
  ai?: AiBridge;
  autopilot: boolean;
  /** Minutos entre rondas del piloto automático. */
  rhythmMin: number;
}

const WALK_SPEED = 44;
const LOG_KEEP = 150;
/** Segundos que suele tardar la IA en una tarea: solo sirve para mover la barra mientras tanto. */
const AI_EXPECTED_MS = 25_000;
const MINUTE = 60_000;

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export class OfficeWorld {
  projects: Project[];
  tasks: Task[] = [];
  log: LogEntry[];
  layout: Layout;
  paused: boolean;
  speed: Speed;
  simT = 0;

  private agents: Agent[] = [];
  private spots = new Map<string, AgentId>();
  private brainTimer = 2;
  private allDoneAnnounced = false;
  private logId: number;
  private hooks: WorldHooks;
  private dirty = true;
  private ai?: AiBridge;
  autopilot: boolean;
  rhythmMin: number;
  /** El CEO está esperando a la IA para decidir. */
  planning = false;
  private nextPlanAt = 0;
  /** Último motivo por el que la IA está parada, para la cabecera. */
  aiNotice?: string;

  constructor(opts: WorldOptions) {
    this.projects = opts.projects;
    this.log = opts.log.slice(0, LOG_KEEP);
    this.logId = this.log.reduce((max, e) => Math.max(max, e.id), 0);
    this.paused = opts.paused;
    this.speed = opts.speed;
    this.hooks = opts.hooks;
    this.ai = opts.ai;
    this.autopilot = opts.autopilot;
    this.rhythmMin = opts.rhythmMin;
    this.layout = buildLayout(this.projects.map((p) => p.id));
    this.spawnAgents(opts.activeTasks);
  }

  setAutopilot(on: boolean) {
    if (on === this.autopilot) return;
    this.autopilot = on;
    // Al encenderlo, que el CEO piense en cuanto esté libre.
    if (on) this.nextPlanAt = 0;
    this.addLog('sistema', on ? 'Piloto automático encendido: Álex repartirá trabajo él solo.' : 'Piloto automático apagado.');
  }

  /** Añade tareas a la cola del CEO. Devuelve las que se han aceptado. */
  addPlanned(items: PlanItem[], source: 'auto' | 'chat'): Task[] {
    const added: Task[] = [];
    for (const item of items) {
      const project = this.projects.find((p) => p.id === item.projectId && p.status !== 'hecho');
      const agent = this.agent(item.agentId);
      const title = item.title.trim().slice(0, 80);
      if (!project || !agent || agent.def.role === 'CEO' || !title) continue;
      const task: Task = {
        id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        projectId: project.id,
        agentId: agent.def.id,
        title,
        status: 'pendiente',
        progress: 0,
        duration: 16 + Math.random() * 12,
        gain: Math.max(1, Math.min(15, Math.round(item.gain * 10) / 10 || 5)),
        createdAt: Date.now(),
        brief: item.brief.trim().slice(0, 1500),
        source,
      };
      this.tasks.push(task);
      this.hooks.task(task);
      added.push(task);
      this.addLog('plan', `planifica «${title}» para ${agent.def.name} (${project.name})`, this.ceo.def.id);
    }
    return added;
  }

  /** El agente está escribiendo una respuesta del chat (bocadillo «escribiendo…»). */
  setTyping(agentId: AgentId, on: boolean) {
    const a = this.agent(agentId);
    if (!a) return;
    a.typingSince = on ? this.simT : undefined;
    this.dirty = true;
  }

  /** Muestra el principio de la respuesta del chat en su bocadillo. */
  chatReply(agentId: AgentId, text: string) {
    const a = this.agent(agentId);
    if (!a) return;
    a.typingSince = undefined;
    const plain = text.replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
    this.say(a, plain.length > 70 ? `${plain.slice(0, 68)}…` : plain, 4.5);
    this.dirty = true;
  }

  typingAgents(): AgentId[] {
    return this.agents.filter((a) => a.typingSince !== undefined).map((a) => a.def.id);
  }

  /* ---------- órdenes ---------- */

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.addLog('sistema', paused ? 'Simulación en pausa.' : 'Simulación en marcha.');
  }

  setSpeed(speed: Speed) {
    this.speed = speed;
    this.dirty = true;
  }

  addProject(input: ProjectInput): Project {
    const base = input.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const project: Project = {
      ...input,
      id: `${base || 'proyecto'}-${Math.random().toString(36).slice(2, 6)}`,
      progress: Math.max(0, Math.min(100, input.progress)),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    this.normalizeStatus(project);
    this.projects.push(project);
    this.allDoneAnnounced = false;
    this.relayout();
    this.addLog('sistema', `Nuevo proyecto: ${project.name}. Tiene su mesa en la oficina.`);
    this.hooks.projectsChanged(this.projects);
    return project;
  }

  updateProject(id: string, input: ProjectInput): boolean {
    const project = this.projects.find((p) => p.id === id);
    if (!project) return false;
    Object.assign(project, input, { progress: Math.max(0, Math.min(100, input.progress)) });
    this.normalizeStatus(project);
    if (project.status !== 'hecho') this.allDoneAnnounced = false;
    if (project.status === 'hecho') this.cancelProjectTasks(id, 'El proyecto se ha marcado como hecho');
    this.addLog('sistema', `Proyecto actualizado: ${project.name}.`);
    this.hooks.projectsChanged(this.projects);
    return true;
  }

  deleteProject(id: string): boolean {
    const project = this.projects.find((p) => p.id === id);
    if (!project) return false;
    this.cancelProjectTasks(id, 'Proyecto eliminado');
    this.projects = this.projects.filter((p) => p.id !== id);
    this.relayout();
    this.addLog('sistema', `Proyecto eliminado: ${project.name}.`);
    this.hooks.projectsChanged(this.projects);
    return true;
  }

  /** Vuelve a los proyectos indicados y recoloca al equipo. */
  reset(projects: Project[]) {
    for (const task of this.tasks) {
      if (task.status === 'pendiente' || task.status === 'asignada' || task.status === 'en-curso') {
        task.status = 'cancelada';
        this.hooks.task(task);
      }
    }
    this.planning = false;
    this.projects = projects;
    this.tasks = [];
    this.allDoneAnnounced = false;
    this.layout = buildLayout(this.projects.map((p) => p.id));
    this.spawnAgents([]);
    this.addLog('sistema', 'Demo reiniciada con los proyectos de ejemplo.');
    this.hooks.projectsChanged(this.projects);
  }

  /* ---------- bucle ---------- */

  tick(dt: number) {
    if (this.paused) return;
    const sdt = dt * this.speed;
    this.simT += sdt;
    for (const a of this.agents) this.updateAgent(a, sdt);
    this.updateWork(sdt);
    this.updateBrain(sdt);
    this.updateIdle(sdt);
  }

  /** ¿Ha pasado algo (tarea, proyecto, estado) desde la última vez que se preguntó? */
  takeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  isAnyoneWorking(): boolean {
    return this.agents.some((a) => a.activity === 'trabajando');
  }

  frame(): Frame {
    return {
      t: Math.round(this.simT * 1000) / 1000,
      agents: this.agents.map((a) => ({
        id: a.def.id,
        x: Math.round(a.x * 100) / 100,
        y: Math.round(a.y * 100) / 100,
        dir: a.dir,
        pose: a.pose,
        moving: a.waypoints.length > 0,
        walk: Math.round(a.walkDist * 10) / 10,
        bubble:
          a.bubble ??
          (a.typingSince !== undefined
            ? { text: 'escribiendo', think: true, typing: true, born: a.typingSince, until: this.simT + 1 }
            : undefined),
      })),
    };
  }

  /** Estado sin la parte de la IA (la añade el servidor, que sabe el gasto). */
  snapshot(withLog: boolean): Omit<Snapshot, 'ai'> {
    return {
      agents: this.agents.map((a) => ({
        id: a.def.id,
        name: a.def.name,
        role: a.def.role,
        roleName: a.def.roleName,
        color: a.def.color,
        activity: a.activity,
        detail: a.detail,
        projectId: a.projectId,
      })),
      projects: this.projects.map((p) => ({ ...p, progress: Math.round(p.progress * 10) / 10 })),
      tasks: this.tasks
        .filter((t) => t.status === 'pendiente' || t.status === 'asignada' || t.status === 'en-curso')
        .map((t) => ({ ...t, progress: Math.round(t.progress * 1000) / 1000 })),
      log: withLog ? this.log.slice() : [],
      paused: this.paused,
      speed: this.speed,
      typing: this.typingAgents(),
    };
  }

  /* ---------- agentes ---------- */

  private spawnAgents(activeTasks: Task[]) {
    this.agents = [];
    this.spots.clear();
    const startSpots: Record<string, string> = { nora: 'sofa1', sara: 'charla1', hugo: 'charla2', leo: 'sofa0', ivan: 'puf' };
    for (const def of AGENTS) {
      const agent: Agent = {
        def,
        x: 0,
        y: 0,
        dir: 'down',
        pose: 'stand',
        place: { kind: 'ceo' },
        anchor: { tx: 0, ty: 0 },
        queue: [],
        timer: 0,
        waypoints: [],
        walkDist: 0,
        activity: 'cafe',
        detail: 'En el café',
        reserved: false,
        idleTimer: 2 + Math.random() * 6,
        idleSince: this.simT,
      };
      this.agents.push(agent);
      if (def.role === 'CEO') {
        this.placeAt(agent, { kind: 'ceo' });
        agent.activity = 'despacho';
        agent.detail = 'En su despacho';
        continue;
      }
      const spot = startSpots[def.id] ?? this.freeSpot(agent) ?? 'cafetera';
      this.spots.set(spot, def.id);
      this.placeAt(agent, { kind: 'spot', id: spot });
    }
    // Las pendientes vuelven a la cola; quien tenía una tarea a medias vuelve a su mesa con ella.
    for (const saved of activeTasks) {
      const project = this.projects.find((p) => p.id === saved.projectId && p.status !== 'hecho');
      if (saved.status === 'pendiente' && project) {
        this.tasks.push({ ...saved });
        continue;
      }
      const agent = this.agent(saved.agentId);
      const deskTaken = this.agents.some((a) => a.projectId === saved.projectId);
      if (!project || !agent || agent.taskId || deskTaken || agent.def.role === 'CEO') {
        saved.status = 'cancelada';
        this.hooks.task(saved);
        continue;
      }
      const task: Task = { ...saved, status: 'en-curso' };
      this.tasks.push(task);
      this.hooks.task(task);
      this.releaseSpot(agent);
      agent.taskId = task.id;
      agent.projectId = project.id;
      this.placeAt(agent, { kind: 'desk', projectId: project.id });
      agent.activity = 'trabajando';
      agent.detail = `${task.title} · ${project.name}`;
      // Con IA, la respuesta anterior se perdió al apagar: se vuelve a pedir.
      if (this.ai && task.source !== 'simulada') this.runAiWork(agent, task, project);
    }
    this.dirty = true;
  }

  private agent(id: AgentId) {
    return this.agents.find((a) => a.def.id === id);
  }

  private get ceo() {
    return this.agents.find((a) => a.def.role === 'CEO')!;
  }

  private resolve(place: Place): Dest {
    const L = this.layout;
    switch (place.kind) {
      case 'desk': {
        const desk = L.desks.find((d) => d.projectId === place.projectId);
        if (desk) return { tile: desk.approach, final: desk.seat, face: 'up', pose: 'type' };
        return { tile: L.coffeeSpot.approach, pose: 'stand' };
      }
      case 'spot': {
        const spot = L.cafeSpots.find((s) => s.id === place.id) ?? L.coffeeSpot;
        return { tile: spot.approach, final: spot.seat, face: spot.face, pose: spot.pose };
      }
      case 'ceo':
        return { tile: L.ceoApproach, final: L.ceoSeat, face: 'down', pose: 'sit-front' };
      case 'tile':
        return { tile: place.tile, face: place.face, pose: 'stand' };
    }
  }

  private placeAt(a: Agent, place: Place) {
    const dest = this.resolve(place);
    const pos = dest.final ?? tileCenter(dest.tile);
    a.x = pos.x;
    a.y = pos.y;
    a.anchor = dest.tile;
    a.pose = dest.pose;
    a.dir = dest.face ?? 'down';
    a.place = place;
    a.waypoints = [];
    a.target = undefined;
  }

  /** Calcula el camino. Devuelve false si ya estaba allí (llega al instante). */
  private startGoto(a: Agent, place: Place): boolean {
    const dest = this.resolve(place);
    const here = tileAt(a);
    const seated = a.pose !== 'stand';
    const from = seated || isBlocked(this.layout, here) ? nearestFree(this.layout, a.anchor) : here;
    const points: Point[] = [];
    if (seated) points.push({ x: a.x, y: tileCenter(from).y }, tileCenter(from));
    else if (Math.abs(a.x - tileCenter(from).x) + Math.abs(a.y - tileCenter(from).y) > 1) points.push(tileCenter(from));
    for (const t of findPath(this.layout, from, dest.tile)) points.push(tileCenter(t));
    if (dest.final) {
      const last = points.length ? points[points.length - 1] : { x: a.x, y: a.y };
      points.push({ x: dest.final.x, y: last.y }, dest.final);
    }
    a.target = { place, dest };
    if (!points.length) {
      this.arrive(a);
      return false;
    }
    a.pose = 'stand';
    a.waypoints = points;
    return true;
  }

  private arrive(a: Agent) {
    if (!a.target) return;
    const { place, dest } = a.target;
    a.place = place;
    a.anchor = dest.tile;
    a.pose = dest.pose;
    if (dest.face) a.dir = dest.face;
    a.target = undefined;
  }

  private updateAgent(a: Agent, dt: number) {
    if (a.bubble && this.simT > a.bubble.until) a.bubble = undefined;

    if (a.waypoints.length) {
      let move = WALK_SPEED * dt;
      while (move > 0 && a.waypoints.length) {
        const wp = a.waypoints[0];
        const dx = wp.x - a.x;
        const dy = wp.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        if (dist <= move) {
          a.x = wp.x;
          a.y = wp.y;
          a.walkDist += dist;
          move -= dist;
          a.waypoints.shift();
        } else {
          a.x += (dx / dist) * move;
          a.y += (dy / dist) * move;
          a.walkDist += move;
          move = 0;
        }
      }
      if (!a.waypoints.length) {
        this.arrive(a);
        a.current = undefined;
      }
      return;
    }

    if (a.current) {
      const act = a.current;
      if (act.kind === 'hold') return;
      a.timer -= dt;
      if (a.timer > 0) return;
      a.current = undefined;
    }

    while (!a.current && a.queue.length) {
      const act = a.queue.shift()!;
      switch (act.kind) {
        case 'goto':
          if (this.startGoto(a, typeof act.place === 'function' ? act.place() : act.place)) {
            a.current = act;
            return;
          }
          break;
        case 'wait':
          a.current = act;
          a.timer = act.t;
          return;
        case 'say':
          this.say(a, act.text, act.t, act.think);
          if (act.block !== false) {
            a.current = act;
            a.timer = act.t;
            return;
          }
          break;
        case 'face':
          a.dir = typeof act.dir === 'function' ? act.dir() : act.dir;
          break;
        case 'call':
          act.fn();
          break;
        case 'hold':
          a.current = act;
          return;
      }
    }
  }

  private say(a: Agent, text: string, t: number, think = false) {
    a.bubble = { text, think, born: this.simT, until: this.simT + t };
  }

  /** Detiene a un agente en la siguiente casilla y lo deja esperando. */
  private interrupt(a: Agent) {
    a.queue = [];
    if (a.waypoints.length && a.target) {
      const next = a.waypoints[0];
      const seatStep = a.target.dest.final && (next.x === a.target.dest.final.x || a.waypoints.length <= 2);
      const stop = seatStep ? { x: a.x, y: a.y } : next;
      const tile = nearestFree(this.layout, tileAt(stop));
      a.waypoints = [tileCenter(tile)];
      a.target = { place: { kind: 'tile', tile }, dest: { tile, pose: 'stand' } };
    }
    a.current = undefined;
    a.queue.push({ kind: 'hold' });
  }

  private release(a: Agent, actions: Action[]) {
    a.current = undefined;
    a.queue = actions;
  }

  private dirTowards(from: Agent, to: Agent): Dir {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }

  /** Casilla libre junto al trabajador para que el CEO le hable. */
  private besideTile(worker: Agent): { tile: Tile; face: Dir } {
    const base = worker.pose === 'stand' ? tileAt(worker) : worker.anchor;
    const taken = new Set(
      this.agents
        .filter((o) => o !== worker && o !== this.ceo)
        .map((o) => {
          const t = o.pose === 'stand' ? tileAt(o) : o.anchor;
          return `${t.tx},${t.ty}`;
        }),
    );
    const options: Array<[number, number, Dir]> = [
      [-1, 0, 'right'],
      [1, 0, 'left'],
      [0, 1, 'up'],
      [0, -1, 'down'],
      [-1, 1, 'up'],
      [1, 1, 'up'],
    ];
    for (const [dx, dy, face] of options) {
      const t = { tx: base.tx + dx, ty: base.ty + dy };
      if (!isBlocked(this.layout, t) && !taken.has(`${t.tx},${t.ty}`)) return { tile: t, face };
    }
    return { tile: nearestFree(this.layout, { tx: base.tx, ty: base.ty + 1 }), face: 'up' };
  }

  /* ---------- café ---------- */

  private freeSpot(a: Agent, exclude?: string): string | undefined {
    const free = this.layout.cafeSpots.filter(
      (s) => s.id !== exclude && (!this.spots.has(s.id) || this.spots.get(s.id) === a.def.id),
    );
    return free.length ? pick(free).id : undefined;
  }

  private releaseSpot(a: Agent) {
    for (const [id, owner] of this.spots) if (owner === a.def.id) this.spots.delete(id);
  }

  private goToCafe(a: Agent, withCoffee: boolean) {
    this.releaseSpot(a);
    const actions: Action[] = [];
    if (withCoffee && !this.spots.has('cafetera')) {
      this.spots.set('cafetera', a.def.id);
      actions.push(
        { kind: 'goto', place: { kind: 'spot', id: 'cafetera' } },
        { kind: 'call', fn: () => this.setActivity(a, 'cafe', 'Preparándose un café') },
        { kind: 'wait', t: 2.2 },
        { kind: 'say', text: pick(PHRASES.coffee), t: 1.6 },
        {
          kind: 'call',
          fn: () => {
            this.spots.delete('cafetera');
            const spot = this.freeSpot(a, 'cafetera');
            if (spot) {
              this.spots.set(spot, a.def.id);
              a.queue.unshift({ kind: 'goto', place: { kind: 'spot', id: spot } });
            }
          },
        },
      );
    } else {
      const spot = this.freeSpot(a) ?? 'cafetera';
      this.spots.set(spot, a.def.id);
      actions.push({ kind: 'goto', place: { kind: 'spot', id: spot } });
    }
    actions.push({ kind: 'call', fn: () => this.setActivity(a, 'cafe', 'En el café') });
    a.queue.push(...actions);
  }

  private updateIdle(dt: number) {
    for (const a of this.agents) {
      if (a.def.role === 'CEO' || a.activity !== 'cafe' || a.reserved) continue;
      if (a.current || a.queue.length || a.waypoints.length) continue;
      a.idleTimer -= dt;
      if (a.idleTimer > 0) continue;
      a.idleTimer = 6 + Math.random() * 9;
      const roll = Math.random();
      if (roll < 0.3) {
        const others = this.agents.filter((o) => o !== a && o.activity === 'cafe');
        if (others.length) this.say(a, pick(PHRASES.chat), 2.6);
      } else if (roll < 0.55) {
        this.goToCafe(a, Math.random() < 0.5);
      }
    }
  }

  /* ---------- trabajo y CEO ---------- */

  private newTask(project: Project, agent: Agent, title: string): Task {
    const task: Task = {
      id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      projectId: project.id,
      agentId: agent.def.id,
      title,
      status: 'asignada',
      progress: 0,
      duration: 16 + Math.random() * 12,
      gain: Math.round((4 + Math.random() * 5) * 10) / 10,
      createdAt: Date.now(),
      source: 'simulada',
    };
    this.tasks.push(task);
    this.hooks.task(task);
    return task;
  }

  /** Quita de memoria las tareas cerradas antiguas (siguen en la base de datos). */
  private pruneTasks() {
    if (this.tasks.length <= 200) return;
    const open = (t: Task) => t.status === 'pendiente' || t.status === 'asignada' || t.status === 'en-curso';
    const closed = this.tasks.filter((t) => !open(t));
    const drop = new Set(closed.slice(0, this.tasks.length - 200).map((t) => t.id));
    this.tasks = this.tasks.filter((t) => !drop.has(t.id));
  }

  /** ¿Lo está haciendo la IA? (si no, la barra avanza con el tiempo simulado). */
  private isAiTask(task: Task) {
    return !!this.ai && task.startedAt !== undefined;
  }

  private updateWork(dt: number) {
    for (const a of this.agents) {
      if (a.activity !== 'trabajando' || !a.taskId || a.waypoints.length) continue;
      const task = this.tasks.find((t) => t.id === a.taskId);
      const project = this.projects.find((p) => p.id === task?.projectId);
      if (!task || !project) continue;
      if (this.isAiTask(task)) {
        // Mientras responde la IA, la barra se acerca al 95 % sin llegar.
        const elapsed = Date.now() - (task.startedAt ?? Date.now());
        task.progress = Math.min(0.95, 1 - Math.exp(-elapsed / AI_EXPECTED_MS));
        continue;
      }
      const step = dt / task.duration;
      task.progress = Math.min(1, task.progress + step);
      project.progress = Math.min(100, project.progress + task.gain * step);
      if (task.progress >= 1 || project.progress >= 100) this.finishTask(a, task, project);
    }
  }

  /** Pide a la IA que haga la tarea; al volver, termina o falla. */
  private runAiWork(a: Agent, task: Task, project: Project) {
    const ai = this.ai;
    if (!ai) return;
    task.startedAt = Date.now();
    task.progress = 0;
    this.hooks.task(task);
    ai.work(task, project).then(
      (res) => {
        if (task.status !== 'en-curso' || a.taskId !== task.id) return;
        task.resultFile = res.file;
        task.summary = res.summary;
        this.finishTask(a, task, project);
      },
      (err) => {
        if (task.status !== 'en-curso' || a.taskId !== task.id) return;
        this.failTask(a, task, ai.describe(err));
      },
    );
  }

  private failTask(a: Agent, task: Task, failure: AiFailure) {
    // Sin cuota o al límite del día, la tarea vuelve a la cola y se retoma cuando se pueda.
    const retry = failure.kind === 'cuota' || failure.kind === 'limite';
    task.status = retry ? 'pendiente' : 'error';
    task.error = failure.message;
    task.progress = 0;
    task.startedAt = undefined;
    this.hooks.task(task);
    a.taskId = undefined;
    a.projectId = undefined;
    const what = retry ? 'vuelve a la cola' : 'se queda sin hacer';
    this.addLog('sistema', `${a.def.name} no ha podido terminar «${task.title}» (${what}): ${failure.message}`);
    this.setActivity(a, 'yendo', 'Al café');
    this.say(a, failure.bubble, 4);
    a.queue = [{ kind: 'wait', t: 2.5 }];
    this.goToCafe(a, false);
    this.pruneTasks();
  }

  private finishTask(a: Agent, task: Task, project: Project) {
    const ai = this.isAiTask(task);
    task.status = 'hecha';
    task.progress = 1;
    // Con IA el avance se suma de golpe al entregar; simulado, ya se fue sumando.
    if (ai) project.progress = Math.min(100, project.progress + task.gain);
    this.hooks.task(task);
    a.taskId = undefined;
    a.projectId = undefined;
    const where = task.resultFile ? ` → ${task.resultFile}` : '';
    this.addLog('hecho', `termina «${task.title}» (+${task.gain}% en ${project.name})${where}`, a.def.id);
    this.pruneTasks();
    if (project.progress >= 99.95) {
      project.progress = 100;
      project.status = 'hecho';
      this.addLog('hecho', `¡Proyecto ${project.name} terminado!`);
    }
    this.hooks.projectsChanged(this.projects);
    this.setActivity(a, 'yendo', 'Al café');
    a.idleSince = this.simT;
    this.say(a, pick(PHRASES.done), 1.8);
    a.queue = [{ kind: 'wait', t: 1.2 }];
    this.goToCafe(a, Math.random() < 0.7);
  }

  private updateBrain(dt: number) {
    const ceo = this.ceo;
    if (ceo.activity !== 'despacho' || ceo.current || ceo.queue.length || ceo.waypoints.length) return;
    this.brainTimer -= dt;
    if (this.brainTimer > 0) return;
    this.brainTimer = 2 + Math.random() * 2.5;

    const busy = new Set(
      this.tasks.filter((t) => t.status === 'asignada' || t.status === 'en-curso').map((t) => t.projectId),
    );
    const open = this.projects.filter((p) => p.status !== 'hecho' && !busy.has(p.id));
    const idle = this.agents
      .filter((a) => a.def.role !== 'CEO' && a.activity === 'cafe' && !a.reserved)
      .sort((x, y) => x.idleSince - y.idleSince);

    // 1) La cola: tareas ya decididas (por la IA o desde el chat) que esperan a su agente.
    //    Si la IA está parada (sin cuota, límite del día), esperan en la cola en vez de fallar.
    const aiBlocked = this.ai?.blocked();
    for (const task of this.tasks.filter((t) => t.status === 'pendiente')) {
      if (aiBlocked && task.source !== 'simulada') continue;
      const project = this.projects.find((p) => p.id === task.projectId);
      if (!project || project.status === 'hecho') {
        task.status = 'cancelada';
        this.hooks.task(task);
        this.dirty = true;
        continue;
      }
      const worker = idle.find((a) => a.def.id === task.agentId);
      if (worker && !busy.has(project.id)) {
        this.assign(ceo, worker, project, task);
        return;
      }
    }

    // 2) Con IA: el piloto automático pide a la IA un reparto nuevo cada cierto tiempo.
    if (this.ai) {
      this.planWithAi(ceo, idle, open);
      return;
    }

    if (this.projects.length && this.projects.every((p) => p.status === 'hecho')) {
      if (!this.allDoneAnnounced) {
        this.allDoneAnnounced = true;
        this.say(ceo, PHRASES.allDone, 4);
        this.addLog('plan', 'Todos los proyectos están terminados. ¡A celebrarlo!', ceo.def.id);
      }
      return;
    }
    if (!idle.length || !open.length) {
      if (Math.random() < 0.25) this.say(ceo, pick(PHRASES.ceoThink), 1.6, true);
      return;
    }

    const weights = open.map((p) => (p.status === 'curso' ? 3 : 2) * (1.2 - p.progress / 200));
    let roll = Math.random() * weights.reduce((s, w) => s + w, 0);
    let project = open[0];
    for (let i = 0; i < open.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        project = open[i];
        break;
      }
    }
    this.assign(ceo, idle[0], project);
  }

  private planWithAi(ceo: Agent, idle: Agent[], open: Project[]) {
    const ai = this.ai!;
    if (!this.autopilot || this.planning || Date.now() < this.nextPlanAt) return;
    if (this.tasks.some((t) => t.status === 'pendiente')) return;
    if (!idle.length || !open.length) return;
    if (ai.blocked()) {
      this.say(ceo, 'Sin IA por ahora: toca esperar', 3, true);
      this.nextPlanAt = Date.now() + 5 * MINUTE;
      this.dirty = true;
      return;
    }
    this.aiNotice = undefined;
    this.planning = true;
    this.setActivity(ceo, 'planificando', 'Pensando prioridades con la IA');
    ceo.bubble = { text: 'Pensando prioridades…', think: true, born: this.simT, until: this.simT + 3600 };
    const input: PlanInput = {
      idle: idle.map((a) => a.def.id),
      open,
      projects: this.projects,
      busy: this.agents
        .filter((a) => a.taskId)
        .map((a) => {
          const t = this.tasks.find((x) => x.id === a.taskId);
          return { agentId: a.def.id, title: t?.title ?? '', projectId: t?.projectId ?? '' };
        }),
    };
    const done = () => {
      this.planning = false;
      ceo.bubble = undefined;
      if (ceo.activity === 'planificando') this.setActivity(ceo, 'despacho', 'En su despacho');
    };
    ai.plan(input).then(
      (items) => {
        if (!this.planning) return;
        done();
        this.nextPlanAt = Date.now() + this.rhythmMin * MINUTE;
        const added = this.addPlanned(items, 'auto');
        if (!added.length) this.say(ceo, 'Ahora mismo no veo nada urgente', 3);
      },
      (err) => {
        if (!this.planning) return;
        done();
        const failure = ai.describe(err);
        const pauseMin = failure.kind === 'cuota' || failure.kind === 'limite' ? 15 : 5;
        this.nextPlanAt = Date.now() + pauseMin * MINUTE;
        this.aiNotice = failure.message;
        this.say(ceo, failure.bubble, 4);
        this.addLog('sistema', `Álex no ha podido planificar: ${failure.message}`);
      },
    );
  }

  private assign(ceo: Agent, worker: Agent, project: Project, planned?: Task) {
    let task: Task;
    if (planned) {
      task = planned;
      task.status = 'asignada';
      this.hooks.task(task);
    } else {
      task = this.newTask(project, worker, taskTitleFor(project.id, project.name, worker.def.role as WorkerRole));
    }
    const title = task.title;
    worker.reserved = true;
    worker.taskId = task.id;
    worker.projectId = project.id;
    this.releaseSpot(worker);
    this.interrupt(worker);
    this.setActivity(worker, 'escuchando', `${ceo.def.name} le va a encargar algo`);
    this.setActivity(ceo, 'planificando', `Decide la siguiente tarea de ${project.name}`);
    this.addLog('plan', `prioriza ${project.name} y se lo encarga a ${worker.def.name}`, ceo.def.id);

    const alive = () => task.status !== 'cancelada';
    ceo.queue = [
      { kind: 'say', text: pick(PHRASES.ceoThink), t: 1.2, think: true },
      {
        kind: 'call',
        fn: () => this.setActivity(ceo, 'repartiendo', `Va a hablar con ${worker.def.name}`),
      },
      {
        kind: 'goto',
        place: () => {
          const beside = this.besideTile(worker);
          return { kind: 'tile', tile: beside.tile, face: beside.face };
        },
      },
      { kind: 'face', dir: () => this.dirTowards(ceo, worker) },
      {
        kind: 'call',
        fn: () => {
          if (!alive()) return;
          if (worker.pose === 'stand') worker.dir = this.dirTowards(worker, ceo);
          ceo.queue.unshift({ kind: 'say', text: `${worker.def.name}: ${title}`, t: 3.4 });
        },
      },
      {
        kind: 'call',
        fn: () => {
          this.setActivity(ceo, 'repartiendo', 'Vuelve a su despacho');
          if (!alive()) return;
          this.addLog('tarea', `recibe «${title}» para ${project.name}`, worker.def.id);
          this.say(worker, pick(PHRASES.acknowledge), 1.6);
          worker.reserved = false;
          this.setActivity(worker, 'yendo', `A la mesa de ${project.name}`);
          this.release(worker, [
            { kind: 'wait', t: 0.7 },
            { kind: 'goto', place: { kind: 'desk', projectId: project.id } },
            { kind: 'call', fn: () => this.startWork(worker, task.id) },
          ]);
        },
      },
      { kind: 'wait', t: 0.6 },
      { kind: 'goto', place: { kind: 'ceo' } },
      { kind: 'call', fn: () => this.setActivity(ceo, 'despacho', 'En su despacho') },
    ];
  }

  private startWork(a: Agent, taskId: string) {
    const task = this.tasks.find((t) => t.id === taskId);
    const project = this.projects.find((p) => p.id === task?.projectId);
    if (!task || !project || task.status === 'cancelada') {
      this.setActivity(a, 'yendo', 'Al café');
      this.goToCafe(a, false);
      return;
    }
    task.status = 'en-curso';
    this.hooks.task(task);
    if (project.status === 'cola') {
      project.status = 'curso';
      this.hooks.projectsChanged(this.projects);
    }
    this.setActivity(a, 'trabajando', `${task.title} · ${project.name}`);
    this.addLog('tarea', `se pone con «${task.title}»`, a.def.id);
    if (this.ai && task.source !== 'simulada') this.runAiWork(a, task, project);
  }

  private cancelProjectTasks(projectId: string, reason: string) {
    for (const task of this.tasks) {
      if (task.projectId !== projectId) continue;
      if (task.status === 'pendiente') {
        task.status = 'cancelada';
        this.hooks.task(task);
        continue;
      }
      if (task.status !== 'asignada' && task.status !== 'en-curso') continue;
      task.status = 'cancelada';
      this.hooks.task(task);
      const a = this.agent(task.agentId);
      if (!a || a.taskId !== task.id) continue;
      a.taskId = undefined;
      a.projectId = undefined;
      a.reserved = false;
      this.addLog('sistema', `${reason}: ${a.def.name} deja «${task.title}».`);
      this.say(a, '¿Eh? Vale…', 1.6);
      this.setActivity(a, 'yendo', 'Al café');
      if (a.waypoints.length && a.target) this.interrupt(a);
      this.release(a, [{ kind: 'wait', t: 0.8 }]);
      this.goToCafe(a, true);
    }
  }

  /* ---------- plano ---------- */

  private relayout() {
    const old = this.layout;
    this.layout = buildLayout(this.projects.map((p) => p.id));
    for (const a of this.agents) {
      const place = a.place;
      if (a.waypoints.length && a.target) {
        const goal = a.target.place;
        const here = nearestFree(this.layout, tileAt(a));
        const c = tileCenter(here);
        a.x = c.x;
        a.y = c.y;
        a.pose = 'stand';
        if (goal.kind === 'desk' && !this.layout.desks.some((d) => d.projectId === goal.projectId)) {
          a.waypoints = [];
          a.target = undefined;
          a.current = undefined;
          continue;
        }
        this.startGoto(a, goal);
      } else if (place.kind === 'tile') {
        const t = nearestFree(this.layout, place.tile);
        this.placeAt(a, { kind: 'tile', tile: t, face: a.dir });
      } else if (place.kind === 'desk' && !this.layout.desks.some((d) => d.projectId === place.projectId)) {
        const oldDesk = old.desks.find((d) => d.projectId === place.projectId);
        const t = nearestFree(this.layout, oldDesk ? oldDesk.approach : tileAt(a));
        this.placeAt(a, { kind: 'tile', tile: t });
      } else {
        const keepDir = a.dir;
        this.placeAt(a, place);
        if (a.pose === 'stand') a.dir = keepDir;
      }
    }
    this.dirty = true;
  }

  /* ---------- estado ---------- */

  private setActivity(a: Agent, activity: AgentActivity, detail: string) {
    a.activity = activity;
    a.detail = detail;
    if (activity === 'cafe') a.idleSince = this.simT;
    this.dirty = true;
  }

  private normalizeStatus(p: Project) {
    if (p.progress >= 100) p.status = 'hecho';
    else if (p.status === 'hecho') p.progress = 100;
  }

  private addLog(kind: LogKind, text: string, agentId?: AgentId) {
    const entry: LogEntry = { id: ++this.logId, at: Date.now(), kind, text, agentId };
    this.log.unshift(entry);
    if (this.log.length > LOG_KEEP) this.log.length = LOG_KEEP;
    this.hooks.log(entry);
    this.dirty = true;
  }
}
