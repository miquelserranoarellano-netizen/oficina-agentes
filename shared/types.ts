// Tipos compartidos por el servidor y el navegador.

export type AgentId = 'alex' | 'leo' | 'nora' | 'ivan' | 'sara' | 'hugo';
export type Role = 'CEO' | 'DEV' | 'DIS' | 'GUI' | 'MKT' | 'INV';
export type WorkerRole = Exclude<Role, 'CEO'>;

export type HairStyle = 'peinado' | 'pincho' | 'melena' | 'rizos' | 'coleta' | 'canoso';
export type Trait = 'corbata' | 'cascos' | 'boina' | 'gafas' | 'coleta' | 'bata';

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  shoes: string;
  trait: Trait;
  /** Color del complemento (cascos, boina, corbata…). */
  accent: string;
}

export interface AgentDef {
  id: AgentId;
  name: string;
  role: Role;
  roleName: string;
  /** Color propio del agente (etiqueta, panel, registro). */
  color: string;
  look: Look;
}

export type ProjectStatus = 'cola' | 'curso' | 'hecho';

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  /** 0 a 100 */
  progress: number;
  status: ProjectStatus;
  createdAt: string;
}

/** pendiente: planificada por el CEO pero aún no entregada al agente. */
export type TaskStatus = 'pendiente' | 'asignada' | 'en-curso' | 'hecha' | 'cancelada' | 'error';

export interface Task {
  id: string;
  projectId: string;
  agentId: AgentId;
  title: string;
  status: TaskStatus;
  /** 0 a 1 */
  progress: number;
  /** Segundos de simulación que dura el trabajo (solo en modo simulado). */
  duration: number;
  /** Puntos de progreso que suma al proyecto al terminar. */
  gain: number;
  createdAt: number;
  /** Instrucciones detalladas del CEO (modo IA). */
  brief?: string;
  /** De dónde sale: el piloto automático del CEO o el chat. */
  source?: 'auto' | 'chat' | 'simulada';
  /** Ruta del resultado dentro de resultados/ (modo IA). */
  resultFile?: string;
  /** Primeras líneas del resultado, para dar contexto al CEO. */
  summary?: string;
  error?: string;
  /** Cuándo empezó a trabajar (ms); estima el avance mientras responde la IA. */
  startedAt?: number;
}

export type LogKind = 'plan' | 'tarea' | 'hecho' | 'sistema' | 'charla';

export interface LogEntry {
  id: number;
  /** Marca de tiempo (ms). La hora se formatea en el navegador, con su zona horaria. */
  at: number;
  agentId?: AgentId;
  kind: LogKind;
  text: string;
}

export type AgentActivity =
  | 'despacho'
  | 'planificando'
  | 'repartiendo'
  | 'escuchando'
  | 'yendo'
  | 'trabajando'
  | 'cafe';

export interface AgentView {
  id: AgentId;
  name: string;
  role: Role;
  roleName: string;
  color: string;
  activity: AgentActivity;
  detail: string;
  projectId?: string;
}

export type Speed = 1 | 2 | 4;

/** Estado de la IA para la cabecera: proveedor, consumo de hoy y piloto automático. */
export interface AiStatus {
  /** simulado: sin IA configurada, los agentes fingen trabajar. */
  mode: 'simulado' | 'ia';
  provider: string;
  model: string;
  /** Por qué no hay IA (falta la clave…), si mode es simulado. */
  reason?: string;
  autopilot: boolean;
  /** Minutos entre rondas de planificación automática del CEO. */
  rhythmMin: number;
  callsToday: number;
  callLimit: number;
  spentToday: number;
  spendLimit: number;
  /** Aviso si la IA está parada (sin cuota, límite del día…) o falló la última planificación. */
  blocked?: string;
  planning: boolean;
}

export interface Snapshot {
  agents: AgentView[];
  projects: Project[];
  /** Tareas pendientes y en marcha. */
  tasks: Task[];
  log: LogEntry[];
  paused: boolean;
  speed: Speed;
  ai: AiStatus;
  /** Agentes que están escribiendo una respuesta en el chat. */
  typing: AgentId[];
}

export interface ChatMessage {
  id: number;
  at: number;
  agentId: AgentId;
  /** null: conversación general, sin proyecto. */
  projectId: string | null;
  role: 'user' | 'agent';
  text: string;
  error?: boolean;
}

export interface ResultInfo {
  taskId: string;
  projectId: string;
  agentId: AgentId;
  title: string;
  at: number;
  file: string;
  summary: string;
}

export type ProjectInput = Pick<Project, 'name' | 'description' | 'color' | 'progress' | 'status'>;

/* ---------- tiempo real (WebSocket) ---------- */

export type Dir = 'down' | 'up' | 'left' | 'right';
export type Pose = 'stand' | 'sit-front' | 'type';

export interface Bubble {
  text: string;
  think: boolean;
  /** «escribiendo…» con puntos animados (respuesta del chat en curso). */
  typing?: boolean;
  /** Tiempo de simulación en que aparece y desaparece. */
  born: number;
  until: number;
}

export interface AgentFrame {
  id: AgentId;
  x: number;
  y: number;
  dir: Dir;
  pose: Pose;
  moving: boolean;
  /** Distancia recorrida (anima las piernas). */
  walk: number;
  bubble?: Bubble;
}

export interface Frame {
  /** Tiempo de simulación. */
  t: number;
  agents: AgentFrame[];
}

/**
 * snapshot: estado de proyectos, agentes y tareas activas. Solo el primero (full) trae el
 * historial; después las entradas nuevas llegan una a una con «log».
 */
export type ServerMessage =
  | { type: 'snapshot'; snapshot: Snapshot; full: boolean }
  | { type: 'frame'; frame: Frame }
  | { type: 'log'; entry: LogEntry }
  | { type: 'chat'; message: ChatMessage };
