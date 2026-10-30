import { WALL_ROWS, type Layout, type WallItem } from '../../shared/layout.ts';
import { C, TILE, pxOf, seeded, shade, type Px } from './pixel';

// Fondo estático (suelos, paredes y lo que cuelga de ellas) y sus detalles animados (estrellas, reloj).

const WALL_H = WALL_ROWS * TILE;

function planks(p: Px, x0: number, y0: number, w: number, h: number, c1: string, c2: string, seam: string, seed: number) {
  const rnd = seeded(seed);
  let row = 0;
  for (let y = y0; y < y0 + h; y += 4, row++) {
    let x = x0 - Math.floor(rnd() * 24);
    let i = 0;
    while (x < x0 + w) {
      const len = 22 + Math.floor(rnd() * 18);
      const xs = Math.max(x, x0);
      const xe = Math.min(x + len, x0 + w);
      if (xe > xs) {
        p(xs, y, xe - xs, 3, (i + row) % 2 ? c1 : c2);
        p(xs, y + 3, xe - xs, 1, seam);
        if (x + len <= x0 + w) p(xe - 1, y, 1, 3, seam);
        if (rnd() < 0.25) p(xs + 4 + Math.floor(rnd() * 10), y + 1, 2, 1, shade(c1, 0.08));
      }
      x += len;
      i++;
    }
  }
}

function checker(p: Px, x0: number, y0: number, w: number, h: number, a: string, b: string) {
  for (let y = y0; y < y0 + h; y += 8) {
    for (let x = x0; x < x0 + w; x += 8) {
      const odd = ((x - x0) / 8 + (y - y0) / 8) % 2 === 1;
      p(x, y, Math.min(8, x0 + w - x), Math.min(8, y0 + h - y), odd ? a : b);
      p(x, y, Math.min(8, x0 + w - x), 1, shade(odd ? a : b, 0.1));
    }
  }
}

function rug(p: Px, x: number, y: number, w: number, h: number, border: string, fill: string, inner: string) {
  p(x, y, w, h, C.out);
  p(x + 1, y + 1, w - 2, h - 2, border);
  p(x + 3, y + 3, w - 6, h - 6, fill);
  p(x + 5, y + 5, w - 10, h - 10, inner);
  // dibujo de rombos
  for (let yy = y + 8; yy < y + h - 8; yy += 8) {
    for (let xx = x + 8; xx < x + w - 8; xx += 8) {
      p(xx + 3, yy, 2, 1, border);
      p(xx + 2, yy + 1, 4, 1, border);
      p(xx + 3, yy + 2, 2, 1, border);
    }
  }
  // flecos
  for (let xx = x + 2; xx < x + w - 2; xx += 3) {
    p(xx, y - 1, 1, 1, border);
    p(xx, y + h, 1, 1, border);
  }
}

function wallSection(p: Px, x: number, w: number, wall: string, stripe: string, wains: string, trim: string) {
  p(x, 0, w, 4, C.wallCap);
  p(x, 4, w, 30, wall);
  for (let xx = x + 3; xx < x + w; xx += 8) p(xx, 4, 1, 30, stripe);
  p(x, 34, w, 1, trim);
  p(x, 35, w, 9, wains);
  for (let xx = x + 7; xx < x + w; xx += 16) {
    p(xx, 37, 1, 6, shade(wains, -0.25));
    p(xx + 1, 37, 1, 6, shade(wains, 0.12));
  }
  p(x, 44, w, 3, C.baseboard);
  p(x, 47, w, 1, shade(C.baseboard, -0.4));
}

function windowFrame(p: Px, item: WallItem) {
  const { x, w } = item;
  p(x - 1, 7, w + 2, 30, C.out);
  p(x, 8, w, 28, '#4e4466');
  const sky = ['#0a0f2e', '#0f1640', '#152053', '#1c2b66', '#243779'];
  for (let i = 0; i < 24; i++) p(x + 2, 10 + i, w - 4, 1, sky[Math.min(4, Math.floor(i / 5))]);
  // ciudad
  const rnd = seeded(x * 7 + 3);
  for (let bx = x + 2; bx < x + w - 2; ) {
    const bw = 3 + Math.floor(rnd() * 5);
    const bh = 5 + Math.floor(rnd() * 11);
    p(bx, 34 - bh, Math.min(bw, x + w - 2 - bx), bh, rnd() < 0.5 ? '#0d1233' : '#111840');
    bx += bw;
  }
  // parteluz y alféizar
  p(x + Math.floor(w / 2) - 1, 10, 2, 24, '#4e4466');
  p(x + 2, 21, w - 4, 1, '#4e4466');
  p(x - 2, 35, w + 4, 2, '#7a6a96');
  p(x - 2, 37, w + 4, 1, C.out);
  // brillo del cristal
  p(x + 3, 11, 1, 3, 'rgba(255,255,255,0.18)');
  p(x + 4, 11, 1, 1, 'rgba(255,255,255,0.18)');
}

function whiteboard(p: Px, item: WallItem, noteColors: string[]) {
  const { x, w } = item;
  p(x - 1, 6, w + 2, 31, C.out);
  p(x, 7, w, 29, '#9aa3b8');
  p(x + 2, 9, w - 4, 25, '#e9eef5');
  p(x + 2, 33, w - 4, 1, '#c9d1de');
  // garabatos
  p(x + 5, 12, 18, 1, '#3a5fcd');
  p(x + 5, 15, 12, 1, '#3a5fcd');
  p(x + 5, 18, 15, 1, '#d64545');
  // gráfica de barras
  const bars = [4, 7, 5, 10, 13];
  bars.forEach((h, i) => p(x + 6 + i * 3, 31 - h, 2, h, i === bars.length - 1 ? '#2e9e5b' : '#7c8db5'));
  p(x + 5, 31, 16, 1, '#5b6476');
  // notas adhesivas: una por proyecto
  noteColors.slice(0, 8).forEach((color, i) => {
    const nx = x + 28 + (i % 4) * 8;
    const ny = 11 + Math.floor(i / 4) * 11;
    p(nx, ny, 7, 7, color);
    p(nx, ny, 7, 1, shade(color, 0.25));
    p(nx + 1, ny + 3, 4, 1, shade(color, -0.35));
    p(nx + 1, ny + 5, 3, 1, shade(color, -0.35));
    p(nx + 6, ny + 6, 1, 1, shade(color, -0.2));
  });
  // bandeja de rotuladores
  p(x + 4, 36, w - 8, 2, '#7d869b');
  p(x + 8, 35, 4, 1, '#d64545');
  p(x + 13, 35, 4, 1, '#3a5fcd');
}

function diploma(p: Px, item: WallItem) {
  const { x } = item;
  p(x - 1, 11, 12, 10, C.out);
  p(x, 12, 10, 8, '#d9a441');
  p(x + 1, 13, 8, 6, '#f3ead2');
  p(x + 2, 14, 6, 1, '#8a7a5a');
  p(x + 2, 16, 4, 1, '#8a7a5a');
  p(x + 6, 17, 2, 2, '#c8324a');
}

function menuBoard(p: Px, item: WallItem) {
  const { x, w } = item;
  p(x - 1, 8, w + 2, 22, C.out);
  p(x, 9, w, 20, '#7a5233');
  p(x + 2, 11, w - 4, 16, '#1f3a2e');
  // taza de tiza
  p(x + 5, 15, 6, 5, '#e8e6d9');
  p(x + 6, 16, 4, 3, '#1f3a2e');
  p(x + 11, 16, 2, 2, '#e8e6d9');
  p(x + 6, 12, 1, 2, '#e8e6d9');
  p(x + 8, 13, 1, 2, '#e8e6d9');
  p(x + 15, 13, 9, 1, '#e8e6d9');
  p(x + 15, 16, 7, 1, '#f2c14e');
  p(x + 15, 19, 8, 1, '#e8e6d9');
  p(x + 5, 23, w - 10, 1, '#e8e6d9');
}

export function drawBackground(ctx: CanvasRenderingContext2D, layout: Layout, noteColors: string[]) {
  const p = pxOf(ctx);
  const { width, height, openX0, cafeX0 } = layout;
  const officeW = (openX0 - 1) * TILE;
  const officeEnd = openX0 * TILE;
  const cafeStart = cafeX0 * TILE;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, width, height);

  // Suelos
  const floorY = WALL_H;
  const floorH = (layout.rows - 1 - WALL_ROWS) * TILE;
  planks(p, 0, floorY, officeEnd, floorH, C.woodDark1, C.woodDark2, shade(C.woodDark2, -0.25), 11);
  planks(p, officeEnd, floorY, cafeStart - officeEnd, floorH, C.wood1, C.wood2, C.woodSeam, 23);
  checker(p, cafeStart, floorY, width - cafeStart, floorH, C.tileA, C.tileB);
  // alfombra del despacho, pasillo y café
  rug(p, 1 * TILE, 4 * TILE + 4, 4 * TILE, 6 * TILE - 4, C.rugGold, C.rug, C.rugIn);
  p(officeEnd - TILE, 6 * TILE + 3, cafeStart - officeEnd + 2 * TILE, 2 * TILE - 6, '#2c3560');
  p(officeEnd - TILE, 6 * TILE + 4, cafeStart - officeEnd + 2 * TILE, 2 * TILE - 8, '#3b4a7a');
  for (let x = officeEnd - TILE + 4; x < cafeStart + TILE; x += 6) {
    p(x, 6 * TILE + 6, 2, 1, '#4d5d94');
    p(x + 3, 8 * TILE - 7, 2, 1, '#4d5d94');
  }
  rug(p, (cafeX0 + 1) * TILE + 8, 9 * TILE + 2, 4 * TILE, 2 * TILE + 4, '#2f8f8a', '#245f6a', '#2c7178');
  // sombra de la pared sobre el suelo
  p(0, floorY, width, 2, 'rgba(0,0,0,0.28)');
  p(0, floorY + 2, width, 2, 'rgba(0,0,0,0.12)');
  // borde inferior
  p(0, height - TILE, width, TILE, C.void);
  p(0, height - TILE, width, 3, '#2a2346');
  p(0, height - TILE + 3, width, 1, C.out);

  // Paredes por zonas
  wallSection(p, 0, officeW + TILE, '#3d3462', '#453a6d', '#5a3f4e', '#d9a441');
  wallSection(p, officeEnd, cafeStart - officeEnd, C.wall, '#393d6b', C.wainscot, C.wainscotTrim);
  wallSection(p, cafeStart, width - cafeStart, '#4b3550', '#533b59', '#3e5f63', '#8fb8b0');

  for (const item of layout.wall) {
    if (item.kind === 'window') windowFrame(p, item);
    else if (item.kind === 'whiteboard') whiteboard(p, item, noteColors);
    else if (item.kind === 'diploma') diploma(p, item);
    else if (item.kind === 'menu') menuBoard(p, item);
  }
}

/** Detalles animados de la pared: estrellas, luces de la ciudad, luna, reloj y alguna estrella fugaz. */
export function drawWallDynamic(ctx: CanvasRenderingContext2D, layout: Layout, t: number, now: Date) {
  const p = pxOf(ctx);
  const windows = layout.wall.filter((w) => w.kind === 'window');
  windows.forEach((win, wi) => {
    const rnd = seeded(win.x * 13 + 5);
    for (let i = 0; i < 7; i++) {
      const sx = win.x + 2 + Math.floor(rnd() * (win.w - 4));
      const sy = 10 + Math.floor(rnd() * 12);
      const phase = rnd() * 6.28;
      const tw = Math.sin(t * (1.2 + rnd()) + phase);
      if (tw > -0.3) p(sx, sy, 1, 1, tw > 0.6 ? '#ffffff' : '#a9b6e8');
      if (tw > 0.85) {
        p(sx - 1, sy, 1, 1, 'rgba(255,255,255,0.4)');
        p(sx + 1, sy, 1, 1, 'rgba(255,255,255,0.4)');
      }
    }
    // ventanas encendidas en los edificios
    for (let i = 0; i < 6; i++) {
      const lx = win.x + 3 + Math.floor(rnd() * (win.w - 6));
      const ly = 26 + Math.floor(rnd() * 7);
      const on = Math.sin(t * 0.15 + rnd() * 40) > -0.2;
      if (on) p(lx, ly, 1, 1, rnd() < 0.7 ? '#ffd36b' : '#9ad0ff');
    }
    if (wi === Math.min(1, windows.length - 1)) {
      const mx = win.x + win.w - 9;
      p(mx, 12, 5, 5, '#f3f0c8');
      p(mx + 1, 11, 3, 7, '#f3f0c8');
      p(mx - 1, 13, 7, 3, '#f3f0c8');
      p(mx + 2, 13, 2, 2, '#d9d4a2');
      p(mx + 3, 11, 3, 4, '#152053');
      p(mx + 4, 15, 2, 1, '#152053');
    }
  });
  // estrella fugaz cada ~23 s en una ventana distinta
  const cycle = t % 23;
  if (cycle >= 0 && cycle < 0.7 && windows.length > 0) {
    const n = windows.length;
    const win = windows[((Math.floor(t / 23) % n) + n) % n];
    const k = cycle / 0.7;
    const sx = win.x + 3 + Math.floor(k * (win.w - 8));
    const sy = 11 + Math.floor(k * 6);
    p(sx, sy, 1, 1, '#ffffff');
    p(sx - 1, sy - 1, 1, 1, 'rgba(255,255,255,0.6)');
    p(sx - 2, sy - 1, 1, 1, 'rgba(255,255,255,0.3)');
  }
  // reloj con la hora real
  const clock = layout.wall.find((w) => w.kind === 'clock');
  if (clock) {
    const cx = clock.x + 5;
    const cy = 16;
    p(cx - 5, cy - 4, 11, 9, C.out);
    p(cx - 4, cy - 5, 9, 11, C.out);
    p(cx - 4, cy - 3, 9, 7, '#f4f1e6');
    p(cx - 3, cy - 4, 7, 9, '#f4f1e6');
    p(cx, cy - 4, 1, 1, '#8a8478');
    p(cx, cy + 4, 1, 1, '#8a8478');
    p(cx - 4, cy, 1, 1, '#8a8478');
    p(cx + 4, cy, 1, 1, '#8a8478');
    const hour = ((now.getHours() % 12) + now.getMinutes() / 60) / 12;
    const min = now.getMinutes() / 60;
    const hand = (frac: number, len: number, color: string) => {
      const a = frac * Math.PI * 2 - Math.PI / 2;
      for (let i = 1; i <= len; i++) p(cx + Math.round(Math.cos(a) * i), cy + Math.round(Math.sin(a) * i), 1, 1, color);
    };
    hand(hour, 2, '#1a1426');
    hand(min, 3, '#c8324a');
    p(cx, cy, 1, 1, '#1a1426');
  }
}
