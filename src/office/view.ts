import { AGENTS } from '../../shared/data.ts';
import type { Layout } from '../../shared/layout.ts';
import type { AgentFrame, Frame } from '../../shared/types.ts';
import type { LiveStore } from '../net/live.ts';
import { SceneRenderer, type RenderAgent } from './scene.ts';

// Dibuja lo que manda el servidor. Los fotogramas llegan 10 veces por segundo; aquí se
// interpolan con un pequeño retraso para que el movimiento se vea suave a 60 fps.

const DELAY_MS = 130;

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

export class OfficeView {
  layout: Layout | null = null;
  private live: LiveStore;
  private renderer = new SceneRenderer();
  private canvas?: HTMLCanvasElement;
  private raf = 0;
  private scale = 2;

  constructor(live: LiveStore) {
    this.live = live;
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.canvas = undefined;
  }

  setScale(s: number) {
    this.scale = s;
  }

  setLayout(layout: Layout) {
    this.layout = layout;
  }

  /** Fotograma interpolado para el instante que toca pintar. */
  private sample(): Frame | null {
    const frames = this.live.frames;
    if (!frames.length) return null;
    const at = performance.now() - DELAY_MS;
    let i = frames.length - 1;
    while (i > 0 && frames[i - 1].at > at) i--;
    const b = frames[i];
    const a = i > 0 ? frames[i - 1] : b;
    if (a === b || at >= b.at) return b.frame;
    const k = Math.max(0, Math.min(1, (at - a.at) / (b.at - a.at)));
    const prev = new Map(a.frame.agents.map((ag) => [ag.id, ag]));
    return {
      t: lerp(a.frame.t, b.frame.t, k),
      agents: b.frame.agents.map((nb): AgentFrame => {
        const na = prev.get(nb.id);
        if (!na) return nb;
        // Un salto grande (cambio de plano) no se interpola.
        if (Math.abs(na.x - nb.x) + Math.abs(na.y - nb.y) > 40) return k < 0.5 ? na : nb;
        const near = k < 0.5 ? na : nb;
        return {
          ...near,
          x: lerp(na.x, nb.x, k),
          y: lerp(na.y, nb.y, k),
          walk: lerp(na.walk, nb.walk, k),
          moving: na.moving || nb.moving,
        };
      }),
    };
  }

  private draw() {
    const canvas = this.canvas;
    const snap = this.live.getState().snapshot;
    const layout = this.layout;
    if (!canvas || !snap || !layout) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const frame = this.sample();
    const t = frame?.t ?? 0;
    const moving = new Set(frame?.agents.filter((a) => a.moving).map((a) => a.id));

    const agents: RenderAgent[] = (frame?.agents ?? []).flatMap((fa) => {
      const def = AGENTS.find((d) => d.id === fa.id);
      if (!def) return [];
      const left = fa.bubble ? fa.bubble.until - t : 0;
      return [
        {
          id: fa.id,
          look: def.look,
          color: def.color,
          role: def.role,
          x: fa.x,
          y: fa.y,
          dir: fa.dir,
          pose: fa.pose,
          frame: fa.pose === 'type' ? Math.floor(t * 7) % 2 : fa.moving ? Math.floor(fa.walk / 5) % 4 : 0,
          bubble:
            fa.bubble && left > 0
              ? { text: fa.bubble.text, think: fa.bubble.think, typing: fa.bubble.typing, age: t - fa.bubble.born, left }
              : undefined,
        },
      ];
    });

    const desks = layout.desks.map((d) => {
      const project = snap.projects.find((p) => p.id === d.projectId);
      const worker = snap.agents.find((a) => a.projectId === d.projectId && a.activity === 'trabajando');
      return {
        color: project?.color ?? '#888888',
        working: !!worker && !moving.has(worker.id),
        done: project?.status === 'hecho',
        t,
      };
    });

    this.renderer.render(
      ctx,
      {
        layout,
        projects: snap.projects,
        desks,
        agents,
        simT: t,
        realT: performance.now() / 1000,
        paused: snap.paused,
      },
      this.scale,
    );
  }
}
