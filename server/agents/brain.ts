import { AGENTS, taskTitleFor } from '../../shared/data.ts';
import type { AgentId, ChatMessage, Project, Task, WorkerRole } from '../../shared/types.ts';
import type { AiBridge, AiFailure, PlanInput, PlanItem } from '../../shared/world.ts';
import type { Store } from '../db.ts';
import type { LlmService } from '../llm/index.ts';
import { BUBBLE_FOR, LlmError, type LlmMessage } from '../llm/types.ts';
import { folderContext } from './context.ts';
import { assignmentsSchema, chatCeoSchema, systemFor } from './prompts.ts';
import { saveResult, summarize } from './results.ts';

// El cerebro de la oficina con IA: el CEO reparte, cada agente trabaja y todos chatean.

const WORKERS = AGENTS.filter((a) => a.role !== 'CEO');

function nameOf(id: AgentId) {
  return AGENTS.find((a) => a.id === id)?.name ?? id;
}

/** Saca el objeto JSON de una respuesta aunque venga con texto o bloques de código alrededor. */
function parseJson(text: string): Record<string, unknown> {
  const clean = text.replace(/```(?:json)?/g, '');
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      // se trata abajo
    }
  }
  throw new LlmError('error', 'la IA no devolvió un JSON válido');
}

function toItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = r as Record<string, unknown>;
    if (typeof o.agente !== 'string' || typeof o.proyecto !== 'string' || typeof o.tarea !== 'string') return [];
    return [
      {
        agentId: o.agente as AgentId,
        projectId: o.proyecto,
        title: o.tarea,
        brief: typeof o.instrucciones === 'string' ? o.instrucciones : '',
        gain: typeof o.avance === 'number' ? o.avance : 5,
      },
    ];
  });
}

export class AiBrain implements AiBridge {
  private store: Store;
  private llm: LlmService;

  constructor(store: Store, llm: LlmService) {
    this.store = store;
    this.llm = llm;
  }

  blocked() {
    return this.llm.blocked();
  }

  describe(err: unknown): AiFailure {
    const e = err instanceof LlmError ? err : new LlmError('error', (err as Error)?.message ?? String(err));
    return { kind: e.kind, bubble: BUBBLE_FOR[e.kind], message: e.message };
  }

  /** Ficha de un proyecto para los prompts. */
  private projectBlock(p: Project, withFolder: boolean): string {
    const lines = [`### ${p.name} (id: ${p.id})`, `Estado: ${p.status}, progreso ${Math.round(p.progress)} %`, `Descripción: ${p.description || '—'}`];
    const done = this.store.doneTasks(4, p.id);
    if (done.length) {
      lines.push('Trabajo reciente:');
      for (const t of done) lines.push(`- ${nameOf(t.agentId)}: «${t.title}»${t.summary ? ` → ${t.summary.slice(0, 160)}` : ''}`);
    }
    if (withFolder) {
      const folder = folderContext(p);
      if (folder) lines.push(`Carpeta del proyecto (solo lectura):\n${folder}`);
    }
    return lines.join('\n');
  }

  async plan(input: PlanInput): Promise<PlanItem[]> {
    const openIds = input.open.map((p) => p.id);
    const busy = input.busy.map((b) => `- ${nameOf(b.agentId)} está con «${b.title}» (${b.projectId})`).join('\n') || '- Nadie';
    const max = Math.min(input.idle.length, input.open.length);
    const user = [
      'Estado de los proyectos:',
      input.projects.map((p) => this.projectBlock(p, false)).join('\n\n'),
      '',
      `Equipo ocupado:\n${busy}`,
      `Agentes libres (ids): ${input.idle.join(', ')}`,
      `Proyectos sin nadie trabajando (ids): ${openIds.join(', ')}`,
      '',
      `Reparte como máximo ${max} tareas: una por agente libre y como mucho una por proyecto, usando los ids exactos.`,
    ].join('\n');
    const res = await this.llm.complete({
      agentId: 'alex',
      purpose: 'plan',
      system: systemFor('alex', 'plan'),
      messages: [{ role: 'user', content: user }],
      schema: assignmentsSchema(input.idle, openIds),
      fake: () => fakePlan(input),
    });
    const items = toItems(parseJson(res.text).asignaciones);
    // Una por agente y una por proyecto, solo entre los libres.
    const agents = new Set<string>();
    const projects = new Set<string>();
    return items.filter((it) => {
      if (!input.idle.includes(it.agentId) || !openIds.includes(it.projectId)) return false;
      if (agents.has(it.agentId) || projects.has(it.projectId)) return false;
      agents.add(it.agentId);
      projects.add(it.projectId);
      return true;
    });
  }

  async work(task: Task, project: Project): Promise<{ file: string; summary: string }> {
    const user = [
      'Contexto del proyecto:',
      this.projectBlock(project, true),
      '',
      `Tu tarea: ${task.title}`,
      `Instrucciones de Álex: ${task.brief || 'Haz lo que pide el título, con criterio.'}`,
    ].join('\n');
    const res = await this.llm.complete({
      agentId: task.agentId,
      purpose: 'tarea',
      system: systemFor(task.agentId, 'tarea'),
      messages: [{ role: 'user', content: user }],
      fake: () => fakeResult(task, project),
    });
    const file = saveResult(project, task, res.text, res.model);
    return { file, summary: summarize(res.text) };
  }

  /** Responde en el chat. El CEO puede además devolver tareas para el equipo. */
  async chat(agentId: AgentId, project: Project | null, projects: Project[], teamState: string): Promise<{ reply: string; items: PlanItem[] }> {
    const history: ChatMessage[] = this.store.chatHistory(agentId, project?.id ?? null, 14).filter((m) => !m.error);
    const messages: LlmMessage[] = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    while (messages.length && messages[0].role !== 'user') messages.shift();
    const last = history[history.length - 1]?.text ?? '';

    let system = systemFor(agentId, 'chat');
    if (project) system += `\n\nConversación sobre este proyecto:\n${this.projectBlock(project, true)}`;

    if (agentId !== 'alex') {
      const res = await this.llm.complete({
        agentId,
        purpose: 'chat',
        system,
        messages,
        fake: () => `¡Hola! Soy ${nameOf(agentId)} (respuesta simulada). Me has dicho: «${last.slice(0, 80)}».`,
      });
      return { reply: res.text, items: [] };
    }

    const open = projects.filter((p) => p.status !== 'hecho');
    system += `\n\nEstado del equipo:\n${teamState}\n\nProyectos:\n${projects.map((p) => this.projectBlock(p, false)).join('\n\n')}`;
    const workerIds = WORKERS.map((a) => a.id);
    const schema = open.length
      ? chatCeoSchema(workerIds, open.map((p) => p.id))
      : { type: 'object', additionalProperties: false, required: ['respuesta'], properties: { respuesta: { type: 'string' } } };
    const res = await this.llm.complete({
      agentId,
      purpose: 'chat',
      system,
      messages,
      schema,
      fake: () => fakeCeoChat(last, project ?? open[0] ?? null),
    });
    let data: Record<string, unknown>;
    try {
      data = parseJson(res.text);
    } catch {
      return { reply: res.text, items: [] };
    }
    const reply = typeof data.respuesta === 'string' && data.respuesta.trim() ? data.respuesta : 'Hecho.';
    return { reply, items: toItems(data.asignaciones) };
  }
}

/* ---------- respuestas del proveedor «simulado» ---------- */

function fakePlan(input: PlanInput): string {
  const asignaciones = input.idle.slice(0, input.open.length).map((agentId, i) => {
    const project = input.open[i];
    const role = AGENTS.find((a) => a.id === agentId)?.role as WorkerRole;
    return {
      agente: agentId,
      proyecto: project.id,
      tarea: taskTitleFor(project.id, project.name, role),
      instrucciones: 'Instrucciones de prueba del proveedor simulado.',
      avance: 4,
    };
  });
  return JSON.stringify({ asignaciones });
}

function fakeResult(task: Task, project: Project): string {
  return `# ${task.title}\n\nResultado de prueba para **${project.name}**, generado por el proveedor simulado (sin IA real).\n\n- Punto uno de la propuesta.\n- Punto dos de la propuesta.\n\n## Siguientes pasos\n\n- Configurar una clave de IA en \`.env\`.\n- Volver a pedir esta tarea.`;
}

function fakeCeoChat(text: string, project: Project | null): string {
  const wantsWork = /\b(haz|haced|prepara|escribe|diseña|investiga|quiero|necesito|que)\b/i.test(text);
  const asignaciones =
    wantsWork && project
      ? [{ agente: 'ivan', proyecto: project.id, tarea: 'Tarea pedida desde el chat', instrucciones: text.slice(0, 200), avance: 3 }]
      : [];
  const respuesta = asignaciones.length
    ? `Entendido (respuesta simulada). Se lo encargo a Iván para ${project?.name}.`
    : 'Hola, soy Álex (respuesta simulada). ¿Qué necesitas que haga el equipo?';
  return JSON.stringify({ respuesta, asignaciones });
}
