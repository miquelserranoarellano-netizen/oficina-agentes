import type { Prop } from '../../shared/layout.ts';
import { C, TILE, pxOf, shade, type Px } from './pixel';

// Muebles. Se dibujan cada fotograma, ordenados por su pie, junto con los personajes.

export interface DeskInfo {
  color: string;
  working: boolean;
  done: boolean;
  /** Fase del tecleo para animar la pantalla. */
  t: number;
}

export interface PropContext {
  t: number;
  desks: DeskInfo[];
}

const OUT = C.out;

function plant(p: Px, x: number, y: number, big: boolean, t: number) {
  // x, y: esquina inferior izquierda de la casilla
  const sway = Math.sin(t * 1.3 + x) > 0.6 ? 1 : 0;
  if (big) {
    p(x + 3, y - 9, 10, 9, OUT);
    p(x + 4, y - 8, 8, 7, C.pot);
    p(x + 4, y - 8, 8, 2, shade(C.pot, 0.2));
    p(x + 4, y - 3, 8, 2, C.potDark);
    const leaves: Array<[number, number, number, number, string]> = [
      [1, -26, 6, 9, C.leaf1],
      [8, -28, 6, 10, C.leaf1],
      [3, -21, 10, 8, C.leaf2],
      [0, -17, 6, 6, C.leaf2],
      [10, -18, 6, 7, C.leaf2],
      [5, -26, 5, 6, C.leaf3],
      [2, -15, 3, 3, C.leaf3],
      [11, -15, 3, 2, C.leaf3],
    ];
    for (const [lx, ly, w, h, c] of leaves) p(x + lx + (ly < -20 ? sway : 0), y + ly, w, h, c);
    p(x + 7, y - 13, 2, 5, C.leaf1);
  } else {
    p(x + 4, y - 7, 8, 7, OUT);
    p(x + 5, y - 6, 6, 5, C.pot);
    p(x + 5, y - 6, 6, 1, shade(C.pot, 0.25));
    p(x + 3, y - 15, 10, 8, OUT);
    p(x + 4, y - 14, 8, 7, C.leaf2);
    p(x + 2 + sway, y - 13, 3, 4, C.leaf1);
    p(x + 11 - sway, y - 13, 3, 4, C.leaf1);
    p(x + 6, y - 17, 4, 4, C.leaf2);
    p(x + 5, y - 13, 2, 2, C.leaf3);
    p(x + 9, y - 11, 2, 2, C.leaf3);
    p(x + 7, y - 16, 2, 1, C.leaf3);
  }
}

function desk(p: Px, x: number, y: number, info: DeskInfo, index: number) {
  // Mesa de 32 px, sobre fondo de madera clara. Monitor mirando al espectador.
  p(x, y + 1, 32, 15, OUT);
  p(x + 1, y + 2, 30, 7, C.deskTop);
  p(x + 1, y + 2, 30, 1, C.deskEdge);
  p(x + 1, y + 9, 30, 1, shade(C.deskTop, -0.25));
  p(x + 1, y + 10, 30, 5, C.deskFront);
  p(x + 3, y + 11, 8, 3, shade(C.deskFront, -0.15));
  p(x + 21, y + 11, 8, 3, shade(C.deskFront, -0.15));
  p(x + 7, y + 12, 1, 1, C.deskEdge);
  p(x + 25, y + 12, 1, 1, C.deskEdge);
  // sombra en el suelo
  p(x + 1, y + 16, 30, 1, 'rgba(0,0,0,0.25)');
  // objetos según la mesa
  if (index % 3 === 0) {
    p(x + 3, y + 3, 5, 4, C.paper);
    p(x + 4, y + 4, 3, 1, '#9aa3b8');
  } else if (index % 3 === 1) {
    p(x + 3, y + 1, 4, 5, OUT);
    p(x + 4, y + 2, 2, 3, C.pot);
    p(x + 3, y - 2, 4, 4, C.leaf2);
  } else {
    p(x + 3, y + 3, 6, 2, '#c8324a');
    p(x + 3, y + 5, 6, 2, '#3a5fcd');
  }
  // taza
  p(x + 25, y + 3, 4, 4, OUT);
  p(x + 26, y + 4, 2, 2, index % 2 ? '#f4f4f8' : '#f2c14e');
  p(x + 29, y + 4, 1, 2, OUT);
  // teclado
  p(x + 10, y + 6, 12, 3, OUT);
  p(x + 11, y + 6, 10, 2, '#cfd4e2');
  if (info.working) {
    const k = Math.floor(info.t * 10) % 8;
    p(x + 11 + k, y + 6, 1, 1, '#ffffff');
  }
  // monitor
  const mx = x + 8;
  const my = y - 9;
  p(x + 14, y + 1, 4, 3, OUT);
  p(x + 15, y + 1, 2, 2, '#4a4e69');
  p(mx, my, 16, 11, OUT);
  p(mx + 1, my + 1, 14, 9, C.bezel);
  const sx = mx + 2;
  const sy = my + 2;
  if (info.done) {
    p(sx, sy, 12, 7, '#12301f');
    p(sx + 3, sy + 3, 1, 1, '#5ff28f');
    p(sx + 4, sy + 4, 1, 1, '#5ff28f');
    p(sx + 5, sy + 5, 1, 1, '#5ff28f');
    p(sx + 6, sy + 4, 1, 1, '#5ff28f');
    p(sx + 7, sy + 3, 1, 1, '#5ff28f');
    p(sx + 8, sy + 2, 1, 1, '#5ff28f');
  } else if (info.working) {
    p(sx, sy, 12, 7, shade(info.color, -0.45));
    const scroll = Math.floor(info.t * 3);
    for (let i = 0; i < 4; i++) {
      const line = (scroll + i) * 7;
      const len = 3 + (line % 7);
      const indent = (line % 3) * 1;
      p(sx + 1 + indent, sy + 1 + i * 2 - 0, Math.min(len, 10 - indent), 1, shade(info.color, i === 3 ? 0.55 : 0.15));
    }
    if (Math.floor(info.t * 2) % 2 === 0) p(sx + 1, sy + 7 - 1, 2, 1, '#ffffff');
  } else {
    p(sx, sy, 12, 7, C.screenOff);
    p(sx + 8, sy + 1, 1, 1, 'rgba(255,255,255,0.15)');
    p(sx + 9, sy + 1, 2, 1, 'rgba(255,255,255,0.1)');
    p(sx + 1, sy + 1, 2, 1, shade(info.color, -0.5));
  }
  // luz de encendido con el color del proyecto
  p(mx + 13, my + 9, 1, 1, info.working ? info.color : '#3a3f55');
}

function chair(p: Px, cx: number, y: number) {
  // Silla de oficina vista por detrás, centrada en cx. y = parte superior de la casilla.
  p(cx - 6, y + 6, 12, 8, OUT);
  p(cx - 5, y + 7, 10, 6, C.chairBack);
  p(cx - 5, y + 7, 10, 1, shade(C.chairBack, 0.25));
  p(cx - 3, y + 9, 6, 1, shade(C.chairBack, -0.2));
  p(cx - 1, y + 14, 2, 1, C.chairBase);
  p(cx - 5, y + 15, 10, 1, C.chairBase);
  p(cx - 6, y + 15, 1, 1, '#555a70');
  p(cx + 5, y + 15, 1, 1, '#555a70');
}

function ceoDesk(p: Px, x: number, y: number) {
  const w = 48;
  p(x, y - 1, w, 17, OUT);
  p(x + 1, y, w - 2, 8, '#6a3a26');
  p(x + 1, y, w - 2, 1, '#8a5236');
  p(x + 1, y + 8, w - 2, 1, '#4a271a');
  p(x + 1, y + 9, w - 2, 6, '#552e1f');
  p(x + 1, y + 9, w - 2, 1, '#d9a441');
  for (const px of [x + 4, x + 18, x + 32]) {
    p(px, y + 11, 12, 3, '#4a271a');
    p(px + 5, y + 12, 2, 1, '#d9a441');
  }
  p(x + 1, y + 16, w - 2, 1, 'rgba(0,0,0,0.3)');
  // parte trasera del monitor
  p(x + 8, y - 8, 16, 9, OUT);
  p(x + 9, y - 7, 14, 7, '#2e3046');
  p(x + 15, y - 5, 2, 2, '#4d5170');
  // lámpara de mesa
  p(x + 38, y - 7, 7, 4, OUT);
  p(x + 39, y - 6, 5, 2, '#f2c14e');
  p(x + 41, y - 3, 1, 5, '#9a7a3a');
  p(x + 39, y + 2, 5, 1, '#9a7a3a');
  // placa CEO y papeles
  p(x + 28, y + 4, 8, 3, '#d9a441');
  p(x + 29, y + 5, 6, 1, '#7a5a1f');
  p(x + 3, y + 2, 4, 5, C.paper);
  p(x + 4, y + 3, 3, 4, '#ffffff');
}

function ceoChair(p: Px, x: number, y: number) {
  const cx = x + 8;
  p(cx - 7, y - 10, 14, 22, OUT);
  p(cx - 6, y - 9, 12, 20, '#6e1f2c');
  p(cx - 6, y - 9, 12, 2, '#8e2f3e');
  p(cx - 4, y - 5, 1, 12, '#561620');
  p(cx + 3, y - 5, 1, 12, '#561620');
}

function visitorChair(p: Px, x: number, y: number) {
  chair(p, x + 8, y - 2);
}

function bookshelf(p: Px, x: number, y: number) {
  const w = 32;
  const top = y - 34;
  p(x, top, w, 50, OUT);
  p(x + 1, top + 1, w - 2, 48, '#6b4630');
  const colors = ['#c8324a', '#3a5fcd', '#f2c14e', '#2e9e5b', '#a77bff', '#e8822f', '#4cc9f0', '#eeeeee'];
  for (let s = 0; s < 4; s++) {
    const sy = top + 3 + s * 11;
    p(x + 2, sy, w - 4, 9, '#3a2418');
    let bx = x + 3;
    let i = s * 3;
    while (bx < x + w - 4) {
      const bw = 2 + ((i * 7) % 3);
      const bh = 6 + ((i * 5) % 3);
      if (i % 9 !== 4) p(bx, sy + 9 - bh, bw, bh, colors[i % colors.length]);
      bx += bw + (i % 4 === 0 ? 1 : 0);
      i++;
    }
    p(x + 1, sy + 9, w - 2, 2, '#8a5d40');
  }
}

function lamp(p: Px, x: number, y: number) {
  const cx = x + 8;
  p(cx - 4, y - 26, 9, 7, OUT);
  p(cx - 3, y - 25, 7, 5, '#f7d48a');
  p(cx - 3, y - 25, 7, 1, '#fff0c4');
  p(cx, y - 19, 1, 16, '#2b2d42');
  p(cx - 3, y - 3, 7, 2, OUT);
}

function cabinet(p: Px, x: number, y: number) {
  p(x + 1, y - 6, 14, 22, OUT);
  p(x + 2, y - 5, 12, 20, '#7d869b');
  p(x + 2, y - 5, 12, 1, '#a3abbe');
  for (let i = 0; i < 3; i++) {
    p(x + 3, y - 3 + i * 6, 10, 5, '#6b7488');
    p(x + 6, y - 1 + i * 6, 4, 1, '#c9d1de');
  }
}

function partition(p: Px, x: number, y: number, isLast: boolean) {
  const cx = x + 6;
  p(cx - 1, y - 8, 6, 24, OUT);
  p(cx, y - 8, 4, 24, C.glass);
  p(cx, y - 8, 1, 24, C.glassEdge);
  p(cx + 3, y - 8, 1, 24, shade(C.glassEdge, -0.3));
  p(cx + 1, y - 4, 1, 3, 'rgba(255,255,255,0.35)');
  if (isLast) p(cx - 1, y + 14, 6, 2, C.frame);
}

/** Dintel de la puerta: un marco que flota sobre el hueco. */
function doorPost(p: Px, x: number, y: number) {
  const cx = x + 6;
  p(cx - 1, y - 8, 6, 3, OUT);
  p(cx, y - 7, 4, 1, C.frame);
}

function counter(p: Px, x: number, y: number, w: number, t: number) {
  p(x, y - 2, w, 18, OUT);
  p(x + 1, y - 1, w - 2, 6, '#b7c1cf');
  p(x + 1, y - 1, w - 2, 1, '#d6dde6');
  p(x + 1, y + 5, w - 2, 10, '#5d4b6e');
  for (let i = 0; i < w / 16; i++) {
    p(x + 2 + i * 16, y + 6, 13, 8, '#6c5a7e');
    p(x + 12 + i * 16, y + 9, 1, 2, '#d6dde6');
  }
  // fruta y tazas
  p(x + 3, y - 4, 8, 4, OUT);
  p(x + 4, y - 3, 6, 2, '#e8e6d9');
  p(x + 4, y - 5, 2, 2, '#e54b4b');
  p(x + 7, y - 6, 2, 2, '#f2c14e');
  // cafetera
  const mx = x + 18;
  p(mx, y - 16, 12, 16, OUT);
  p(mx + 1, y - 15, 10, 14, '#2b2d42');
  p(mx + 1, y - 15, 10, 2, '#41445f');
  p(mx + 3, y - 12, 6, 3, '#151626');
  p(mx + 9, y - 13, 1, 1, Math.floor(t * 2) % 2 ? '#ff4d4d' : '#7a1f1f');
  p(mx + 5, y - 8, 2, 2, '#9aa3b8');
  p(mx + 4, y - 4, 4, 3, '#f4f4f8');
  // vapor
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.8 + i / 3) % 1;
    const sy = y - 17 - Math.floor(k * 12);
    const sx = mx + 5 + Math.round(Math.sin((t + i) * 3) * 1.5);
    p(sx, sy, 1, 1, `rgba(255,255,255,${(0.55 * (1 - k)).toFixed(2)})`);
  }
  // tostadora
  p(x + 35, y - 7, 9, 7, OUT);
  p(x + 36, y - 6, 7, 5, '#c9d1de');
  p(x + 37, y - 7, 2, 1, '#555a70');
  p(x + 40, y - 7, 2, 1, '#555a70');
}

function cooler(p: Px, x: number, y: number) {
  p(x + 3, y - 12, 10, 28, OUT);
  p(x + 4, y - 11, 8, 8, '#8fd3ff');
  p(x + 5, y - 10, 2, 5, '#c9ecff');
  p(x + 4, y - 3, 8, 18, '#e8edf2');
  p(x + 6, y + 1, 2, 2, '#3a5fcd');
  p(x + 9, y + 1, 2, 2, '#e54b4b');
  p(x + 4, y + 13, 8, 2, '#b8c2cc');
}

function fridge(p: Px, x: number, y: number) {
  p(x + 1, y - 18, 14, 34, OUT);
  p(x + 2, y - 17, 12, 32, '#dfe6ee');
  p(x + 2, y - 17, 12, 1, '#ffffff');
  p(x + 2, y - 6, 12, 1, '#9aa3b8');
  p(x + 12, y - 14, 1, 5, '#9aa3b8');
  p(x + 12, y - 3, 1, 7, '#9aa3b8');
  p(x + 4, y - 15, 2, 2, '#e54b4b');
  p(x + 7, y - 13, 2, 2, '#f2c14e');
  p(x + 4, y - 1, 3, 3, '#4fd18b');
}

function vending(p: Px, x: number, y: number, t: number) {
  p(x, y - 18, 16, 34, OUT);
  p(x + 1, y - 17, 14, 32, '#b8323a');
  p(x + 1, y - 17, 14, 1, '#e0525a');
  const glow = Math.sin(t * 7) > 0.92 ? '#ffe9b0' : '#ffd88a';
  p(x + 2, y - 15, 9, 22, glow);
  const snacks = ['#3a5fcd', '#2e9e5b', '#e8822f', '#a77bff'];
  for (let r = 0; r < 4; r++) {
    p(x + 2, y - 14 + r * 5 + 3, 9, 1, '#b08a4a');
    for (let c = 0; c < 3; c++) p(x + 3 + c * 3, y - 14 + r * 5, 2, 3, snacks[(r + c) % 4]);
  }
  p(x + 12, y - 13, 2, 6, '#2b2d42');
  p(x + 12, y - 5, 2, 1, '#ffe08a');
  p(x + 3, y + 10, 8, 3, '#2b0f12');
}

function sofa(p: Px, x: number, y: number, w: number) {
  const base = '#2f7f86';
  const light = '#3fa0a8';
  const dark = '#235f64';
  p(x - 2, y - 7, w + 4, 22, OUT);
  p(x, y - 6, w, 9, base);
  p(x, y - 6, w, 1, light);
  for (let i = 1; i < w / 16; i++) p(x + i * 16, y - 5, 1, 7, dark);
  p(x, y + 3, w, 8, light);
  p(x, y + 3, w, 1, '#57b8bf');
  for (let i = 1; i < w / 16; i++) p(x + i * 16, y + 4, 1, 6, base);
  p(x, y + 11, w, 3, dark);
  // reposabrazos
  p(x - 2, y - 2, 5, 16, OUT);
  p(x - 1, y - 1, 3, 14, base);
  p(x - 1, y - 1, 3, 1, light);
  p(x + w - 3, y - 2, 5, 16, OUT);
  p(x + w - 2, y - 1, 3, 14, base);
  p(x + w - 2, y - 1, 3, 1, light);
  // cojín
  p(x + 3, y - 4, 7, 6, '#f2c14e');
  p(x + 4, y - 3, 5, 1, '#f7d98a');
}

function coffeeTable(p: Px, x: number, y: number, w: number) {
  p(x + 4, y + 3, w - 8, 9, OUT);
  p(x + 5, y + 4, w - 10, 5, '#9a6a45');
  p(x + 5, y + 4, w - 10, 1, '#b8845a');
  p(x + 5, y + 9, w - 10, 2, '#6b4630');
  p(x + 10, y + 1, 4, 4, OUT);
  p(x + 11, y + 2, 2, 2, '#f4f4f8');
  p(x + 24, y + 4, 9, 4, '#e86f9a');
  p(x + 25, y + 5, 5, 1, '#ffffff');
  p(x + 36, y + 2, 4, 3, '#2e9e5b');
}

function beanbag(p: Px, x: number, y: number) {
  p(x + 1, y + 4, 14, 12, OUT);
  p(x + 2, y + 5, 12, 10, '#e8822f');
  p(x + 3, y + 5, 6, 2, '#f5a65b');
  p(x + 2, y + 13, 12, 2, '#b8601c');
}

function printer(p: Px, x: number, y: number) {
  p(x + 1, y + 2, 15, 13, OUT);
  p(x + 2, y + 3, 13, 11, '#cfd4e2');
  p(x + 2, y + 3, 13, 2, '#e9edf5');
  p(x + 4, y + 7, 9, 2, '#3a3f55');
  p(x + 5, y, 7, 4, C.paper);
  p(x + 12, y + 11, 2, 1, '#4fd18b');
}

export function drawProp(ctx: CanvasRenderingContext2D, prop: Prop, pc: PropContext, lastPartitionRow: number) {
  const p = pxOf(ctx);
  const x = prop.tx * TILE;
  const y = prop.ty * TILE;
  switch (prop.kind) {
    case 'desk': {
      const info = pc.desks[prop.deskIndex ?? 0];
      if (info) desk(p, x, y, info, prop.deskIndex ?? 0);
      break;
    }
    case 'chair':
      chair(p, x + 16, y);
      break;
    case 'ceoDesk':
      ceoDesk(p, x, y);
      break;
    case 'ceoChair':
      ceoChair(p, x, y);
      break;
    case 'visitorChair':
      visitorChair(p, x, y);
      break;
    case 'bookshelf':
      bookshelf(p, x, y);
      break;
    case 'plant':
      plant(p, x, y + 16, false, pc.t);
      break;
    case 'bigPlant':
      plant(p, x, y + 16, true, pc.t);
      break;
    case 'lamp':
      lamp(p, x, y + 16);
      break;
    case 'cabinet':
      cabinet(p, x, y);
      break;
    case 'partition':
      if (!prop.door) partition(p, x, y, prop.ty === lastPartitionRow);
      else if (prop.ty === 6) doorPost(p, x, y);
      break;
    case 'counter':
      counter(p, x, y, prop.w * TILE, pc.t);
      break;
    case 'cooler':
      cooler(p, x, y);
      break;
    case 'fridge':
      fridge(p, x, y);
      break;
    case 'vending':
      vending(p, x, y, pc.t);
      break;
    case 'sofa':
      sofa(p, x, y, prop.w * TILE);
      break;
    case 'coffeeTable':
      coffeeTable(p, x, y, prop.w * TILE);
      break;
    case 'beanbag':
      beanbag(p, x, y);
      break;
    case 'printer':
      printer(p, x, y);
      break;
  }
}
