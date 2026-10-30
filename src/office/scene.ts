import type { Layout } from '../../shared/layout.ts';
import type { Dir, Look, Pose, Project } from '../../shared/types.ts';
import { drawBackground, drawWallDynamic } from './background';
import { C, TILE, inkFor, pxOf, rgba } from './pixel';
import { drawProp, type DeskInfo } from './props';
import { getSprite, SPRITE_H, SPRITE_W } from './sprites';

// Composición de cada fotograma: mundo en píxeles nativos → luces → escalado → textos nítidos encima.

export interface RenderAgent {
  id: string;
  look: Look;
  color: string;
  role: string;
  x: number;
  y: number;
  dir: Dir;
  pose: Pose;
  frame: number;
  bubble?: { text: string; think: boolean; typing?: boolean; age: number; left: number };
}

export interface SceneState {
  layout: Layout;
  projects: Project[];
  desks: DeskInfo[];
  agents: RenderAgent[];
  simT: number;
  realT: number;
  paused: boolean;
}

const FONT_TEXT = '"VT323", monospace';
const FONT_PIXEL = '"Press Start 2P", monospace';

/** Los textos tienen un tamaño mínimo en píxeles CSS para que se lean en el móvil. */
function dpr() {
  return window.devicePixelRatio || 1;
}

export class SceneRenderer {
  private world = document.createElement('canvas');
  private bg = document.createElement('canvas');
  private light = document.createElement('canvas');
  private bgKey = '';

  render(display: CanvasRenderingContext2D, state: SceneState, s: number) {
    const { layout } = state;
    for (const c of [this.world, this.bg, this.light]) {
      if (c.width !== layout.width || c.height !== layout.height) {
        c.width = layout.width;
        c.height = layout.height;
        this.bgKey = '';
      }
    }
    const key = `${layout.cols}|${state.projects.map((p) => p.color).join(',')}`;
    if (key !== this.bgKey) {
      drawBackground(this.bg.getContext('2d')!, layout, state.projects.map((p) => p.color));
      this.bgKey = key;
    }

    const w = this.world.getContext('2d')!;
    w.imageSmoothingEnabled = false;
    w.globalCompositeOperation = 'source-over';
    w.drawImage(this.bg, 0, 0);
    drawWallDynamic(w, layout, state.realT, new Date());

    // Muebles y personajes ordenados por el pie
    const lastPartitionRow = layout.rows - 2;
    const items: Array<{ y: number; draw: () => void }> = [];
    const pc = { t: state.simT, desks: state.desks };
    for (const prop of layout.props) items.push({ y: prop.sortY, draw: () => drawProp(w, prop, pc, lastPartitionRow) });
    for (const a of state.agents) items.push({ y: a.y, draw: () => this.drawAgent(w, a) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    this.drawLights(w, state);

    display.imageSmoothingEnabled = false;
    display.clearRect(0, 0, display.canvas.width, display.canvas.height);
    display.drawImage(this.world, 0, 0, layout.width * s, layout.height * s);

    this.drawDeskLabels(display, state, s);
    this.drawTags(display, state, s);
    this.drawBubbles(display, state, s);
    if (state.paused) this.drawPause(display, s);
  }

  private drawAgent(w: CanvasRenderingContext2D, a: RenderAgent) {
    const p = pxOf(w);
    if (a.pose === 'stand') {
      p(a.x - 5, a.y - 1, 10, 2, 'rgba(0,0,0,0.28)');
      p(a.x - 4, a.y - 2, 8, 1, 'rgba(0,0,0,0.18)');
    }
    const sprite = getSprite(a.id, a.look, a.pose, a.dir, a.frame);
    w.drawImage(sprite, Math.round(a.x - SPRITE_W / 2), Math.round(a.y - SPRITE_H + 1));
  }

  private drawLights(w: CanvasRenderingContext2D, state: SceneState) {
    const { layout } = state;
    const l = this.light.getContext('2d')!;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, layout.width, layout.height);
    l.fillStyle = 'rgba(8,10,34,0.42)';
    l.fillRect(0, 0, layout.width, layout.height);
    l.globalCompositeOperation = 'destination-out';

    const glows: Array<{ x: number; y: number; r: number; color: string; a: number }> = [];
    for (const li of layout.lights) glows.push({ x: li.x, y: li.y, r: li.r, color: li.color, a: li.strength });
    layout.desks.forEach((d, i) => {
      const info = state.desks[i];
      if (!info) return;
      if (info.working) {
        const flicker = 0.85 + Math.sin(state.simT * 9 + i) * 0.05;
        glows.push({ x: (d.tx + 1) * TILE, y: d.ty * TILE - 2, r: 30, color: info.color, a: flicker });
      } else if (info.done) {
        glows.push({ x: (d.tx + 1) * TILE, y: d.ty * TILE - 2, r: 16, color: '#5ff28f', a: 0.5 });
      }
    });
    for (const g of glows) {
      const grad = l.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      grad.addColorStop(0, `rgba(0,0,0,${g.a})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = grad;
      l.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }
    w.drawImage(this.light, 0, 0);

    // Brillo de color (monitores, lámparas)
    w.globalCompositeOperation = 'lighter';
    for (const g of glows) {
      const grad = w.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r * 0.8);
      grad.addColorStop(0, rgba(g.color, 0.16 * g.a));
      grad.addColorStop(1, rgba(g.color, 0));
      w.fillStyle = grad;
      w.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }
    w.globalCompositeOperation = 'source-over';
  }

  /* ---------- textos ---------- */

  private drawDeskLabels(d: CanvasRenderingContext2D, state: SceneState, s: number) {
    const { layout, projects } = state;
    const fontPx = Math.round(Math.max(11 * dpr(), 6.5 * s));
    d.font = `${fontPx}px ${FONT_TEXT}`;
    d.textBaseline = 'top';
    d.textAlign = 'center';
    const maxW = 46 * s;
    layout.desks.forEach((desk) => {
      const project = projects.find((p) => p.id === desk.projectId);
      if (!project) return;
      const lines = wrap(d, project.name, maxW - 6 * s, 2);
      const lineH = fontPx * 0.9;
      const barH = Math.max(3, Math.round(2 * s));
      const padY = Math.round(1.5 * s);
      const h = lines.length * lineH + barH + padY * 3;
      const textW = Math.max(...lines.map((ln) => d.measureText(ln).width));
      const w = Math.min(maxW, Math.max(30 * s, textW + 6 * s));
      const cx = (desk.tx + 1) * TILE * s;
      const top = desk.row === 'A' ? (desk.ty * TILE - 11) * s - h : (desk.ty + 2) * TILE * s + 1.5 * s;
      const left = Math.round(cx - w / 2);
      const unit = Math.max(1, Math.round(s));
      d.fillStyle = 'rgba(13,16,33,0.86)';
      d.fillRect(left, Math.round(top), Math.round(w), Math.round(h));
      d.fillStyle = project.color;
      d.fillRect(left, Math.round(top), Math.round(w), unit);
      d.fillStyle = '#f4f4f8';
      lines.forEach((ln, i) => d.fillText(ln, cx, Math.round(top + padY + i * lineH)));
      // barra de progreso
      const barY = Math.round(top + padY * 2 + lines.length * lineH);
      const barX = left + Math.round(3 * s);
      const barW = Math.round(w - 6 * s);
      d.fillStyle = '#2a2d45';
      d.fillRect(barX, barY, barW, barH);
      const done = project.status === 'hecho';
      d.fillStyle = done ? '#5ff28f' : project.color;
      d.fillRect(barX, barY, Math.round((barW * Math.min(100, project.progress)) / 100), barH);
    });
  }

  private headTop(a: RenderAgent) {
    return a.pose === 'stand' ? a.y - 22 : a.y - 20;
  }

  private drawTags(d: CanvasRenderingContext2D, state: SceneState, s: number) {
    // Press Start 2P se ve nítida en múltiplos de 4 px
    const size = Math.max(8, Math.round(Math.max(7 * dpr(), 4.2 * s) / 4) * 4);
    d.font = `${size}px ${FONT_PIXEL}`;
    d.textAlign = 'center';
    d.textBaseline = 'middle';
    for (const a of state.agents) {
      const cx = Math.round(a.x * s);
      const cy = Math.round((this.headTop(a) - 4) * s);
      const tw = d.measureText(a.role).width;
      const padX = Math.max(3, Math.round(s * 1.2));
      const h = size + Math.round(s * 1.6);
      const left = Math.round(cx - tw / 2 - padX);
      const top = Math.round(cy - h / 2);
      d.fillStyle = C.out;
      d.fillRect(left - 1, top - 1, tw + padX * 2 + 2, h + 2);
      d.fillStyle = a.color;
      d.fillRect(left, top, tw + padX * 2, h);
      d.fillStyle = inkFor(a.color);
      d.fillText(a.role, cx, cy + 1);
    }
  }

  private drawBubbles(d: CanvasRenderingContext2D, state: SceneState, s: number) {
    const canvasW = d.canvas.width;
    const fontPx = Math.round(Math.max(14 * dpr(), 7.5 * s));
    d.font = `${fontPx}px ${FONT_TEXT}`;
    d.textAlign = 'left';
    d.textBaseline = 'top';
    const u = Math.max(2, Math.round(s));
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const bubbles = state.agents
      .filter((a) => a.bubble)
      .sort((a, b) => this.headTop(b) - this.headTop(a));
    for (const a of bubbles) {
      const b = a.bubble!;
      // «escribiendo…»: el ancho se calcula con tres puntos para que no baile.
      const lines = b.typing ? [`${b.text}...`] : wrap(d, b.text, 78 * s, 3);
      const lineH = Math.round(fontPx * 0.95);
      const textW = Math.max(...lines.map((ln) => d.measureText(ln).width));
      const w = Math.round(textW + u * 6);
      const h = Math.round(lines.length * lineH + u * 4);
      const ax = a.x * s;
      const ay = (this.headTop(a) - 9) * s;
      let x = Math.round(ax - w / 2);
      let y = Math.round(ay - h);
      x = Math.max(u * 2, Math.min(canvasW - w - u * 2, x));
      // evitar solapes empujando hacia arriba
      for (let guard = 0; guard < 6; guard++) {
        const hit = placed.find((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
        if (!hit) break;
        y = hit.y - h - u * 2;
      }
      y = Math.max(u, y);
      placed.push({ x, y, w, h });
      const appear = Math.min(1, b.age / 0.12);
      const fade = Math.min(1, b.left / 0.25);
      d.globalAlpha = Math.max(0, Math.min(appear, fade));
      drawBubbleBox(d, x, y, w, h, u, ax, ay, b.think);
      d.fillStyle = '#1a1426';
      if (b.typing) {
        const dots = '.'.repeat(1 + (Math.floor(b.age * 3) % 3));
        d.fillText(`${b.text}${dots}`, x + u * 3, y + u * 2);
      } else {
        lines.forEach((ln, i) => d.fillText(ln, x + u * 3, y + u * 2 + i * lineH));
      }
      d.globalAlpha = 1;
    }
  }

  private drawPause(d: CanvasRenderingContext2D, s: number) {
    const size = Math.max(16, Math.floor((8 * s) / 8) * 8);
    d.font = `${size}px ${FONT_PIXEL}`;
    d.textAlign = 'center';
    d.textBaseline = 'middle';
    const text = 'PAUSA';
    const w = d.measureText(text).width + size * 2;
    const h = size * 2.2;
    const x = d.canvas.width / 2 - w / 2;
    const y = Math.round(size * 0.8);
    d.fillStyle = 'rgba(13,16,33,0.85)';
    d.fillRect(x, y, w, h);
    d.fillStyle = '#f2c14e';
    d.fillRect(x, y, w, Math.max(2, s));
    d.fillRect(x, y + h - Math.max(2, s), w, Math.max(2, s));
    d.fillStyle = '#f4f4f8';
    d.fillText(text, d.canvas.width / 2, y + h / 2 + 1);
  }
}

function drawBubbleBox(
  d: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  u: number,
  ax: number,
  ay: number,
  think: boolean,
) {
  const out = '#1a1426';
  const fill = think ? '#e9eef7' : '#ffffff';
  // borde con esquinas recortadas, a bloques de "u" píxeles
  d.fillStyle = out;
  d.fillRect(x + u, y - u, w - 2 * u, h + 2 * u);
  d.fillRect(x - u, y + u, w + 2 * u, h - 2 * u);
  d.fillRect(x, y, w, h);
  d.fillStyle = fill;
  d.fillRect(x + u, y, w - 2 * u, h);
  d.fillRect(x, y + u, w, h - 2 * u);
  d.fillStyle = 'rgba(0,0,0,0.08)';
  d.fillRect(x + u, y + h - u, w - 2 * u, u);
  const tx = Math.round(Math.max(x + 3 * u, Math.min(x + w - 4 * u, ax - u)));
  if (think) {
    d.fillStyle = out;
    d.fillRect(tx - u, y + h + u, 3 * u, 3 * u);
    d.fillRect(tx + u, y + h + 5 * u, 2 * u, 2 * u);
    d.fillStyle = fill;
    d.fillRect(tx, y + h + 2 * u, u, u);
  } else {
    d.fillStyle = out;
    d.fillRect(tx - u, y + h, 4 * u, u);
    d.fillRect(tx - u, y + h + u, 3 * u, u);
    d.fillRect(tx, y + h + 2 * u, 2 * u, u);
    d.fillStyle = fill;
    d.fillRect(tx, y + h - u, 2 * u, 2 * u);
    d.fillRect(tx, y + h + u, u, u);
  }
  void ay;
}

function wrap(d: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (d.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && d.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines.map((ln) => {
    if (d.measureText(ln).width <= maxW) return ln;
    let cut = ln;
    while (cut.length > 1 && d.measureText(`${cut}…`).width > maxW) cut = cut.slice(0, -1);
    return `${cut}…`;
  });
}
