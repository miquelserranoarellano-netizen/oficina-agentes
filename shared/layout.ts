import type { Dir, Pose } from './types.ts';

// Plano de la oficina en casillas de 16 px. Se recalcula cuando cambia el número de proyectos:
//   despacho del CEO (izquierda) | zona abierta con mesas y pasillo central | café (derecha)
// Lo usan el servidor (caminos de los agentes) y el navegador (dibujo).

export type { Dir, Pose };

export const TILE = 16;

export interface Tile {
  tx: number;
  ty: number;
}
export interface Point {
  x: number;
  y: number;
}

export interface Desk {
  projectId: string;
  /** Casilla izquierda de la mesa (ocupa dos). */
  tx: number;
  ty: number;
  row: 'A' | 'B';
  seat: Point;
  approach: Tile;
}

export interface Spot {
  id: string;
  approach: Tile;
  /** Punto exacto donde se coloca (si es un asiento). */
  seat?: Point;
  face: Dir;
  pose: Pose;
}

export type PropKind =
  | 'desk'
  | 'chair'
  | 'ceoDesk'
  | 'ceoChair'
  | 'visitorChair'
  | 'bookshelf'
  | 'plant'
  | 'bigPlant'
  | 'lamp'
  | 'cabinet'
  | 'partition'
  | 'counter'
  | 'cooler'
  | 'fridge'
  | 'vending'
  | 'sofa'
  | 'coffeeTable'
  | 'beanbag'
  | 'printer';

export interface Prop {
  kind: PropKind;
  tx: number;
  ty: number;
  /** Ancho en casillas. */
  w: number;
  /** Para las mesas: índice del proyecto. */
  deskIndex?: number;
  /** Para los tabiques: si es el hueco de la puerta. */
  door?: boolean;
  /** Y de ordenación (pie del objeto) en píxeles. */
  sortY: number;
}

export interface WallItem {
  kind: 'window' | 'whiteboard' | 'clock' | 'diploma' | 'menu' | 'poster';
  x: number;
  w: number;
}

export interface LightDef {
  x: number;
  y: number;
  r: number;
  color: string;
  strength: number;
}

export interface Layout {
  cols: number;
  rows: number;
  width: number;
  height: number;
  openX0: number;
  openW: number;
  cafeX0: number;
  blocked: boolean[];
  desks: Desk[];
  props: Prop[];
  wall: WallItem[];
  lights: LightDef[];
  ceoSeat: Point;
  ceoApproach: Tile;
  cafeSpots: Spot[];
  coffeeSpot: Spot;
}

export const WALL_ROWS = 3;
const ROWS = 13;
const OFFICE_W = 7;
const CAFE_W = 7;
const ROW_A = 4;
const ROW_B = 8;

export function buildLayout(projectIds: string[]): Layout {
  const n = projectIds.length;
  const k = Math.max(3, Math.ceil(n / 2));
  const openX0 = OFFICE_W;
  const openW = k * 3 + 1;
  const cafeX0 = openX0 + openW;
  const cols = cafeX0 + CAFE_W;
  const rows = ROWS;
  const blocked = new Array<boolean>(cols * rows).fill(false);
  const block = (tx: number, ty: number, w = 1, h = 1) => {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) blocked[y * cols + x] = true;
  };
  block(0, 0, cols, WALL_ROWS);
  block(0, rows - 1, cols, 1);

  const props: Prop[] = [];
  const add = (kind: PropKind, tx: number, ty: number, w = 1, extra: Partial<Prop> = {}, solid = true) => {
    props.push({ kind, tx, ty, w, sortY: (ty + 1) * TILE, ...extra });
    if (solid) block(tx, ty, w, 1);
  };

  // Tabiques de cristal con puerta a la altura del pasillo (filas 6 y 7).
  for (const px of [OFFICE_W - 1, cafeX0]) {
    for (let ty = WALL_ROWS; ty < rows - 1; ty++) {
      const door = ty === 6 || ty === 7;
      add('partition', px, ty, 1, { door }, !door);
    }
  }

  // Despacho del CEO
  add('bookshelf', 0, 3, 2);
  add('plant', 5, 3);
  add('ceoDesk', 2, 6, 3);
  add('ceoChair', 3, 5, 1, { sortY: 5 * TILE + 10 });
  add('visitorChair', 3, 7);
  add('lamp', 0, 5);
  add('bigPlant', 0, 11);
  add('cabinet', 5, 11);

  // Mesas: columna = índice / 2, fila alterna A (arriba del pasillo) y B (abajo).
  const desks: Desk[] = projectIds.map((projectId, i) => {
    const col = Math.floor(i / 2);
    const row = i % 2 === 0 ? 'A' : 'B';
    const tx = openX0 + 1 + col * 3;
    const ty = row === 'A' ? ROW_A : ROW_B;
    add('desk', tx, ty, 2, { deskIndex: i });
    add('chair', tx, ty + 1, 2, { deskIndex: i, sortY: (ty + 1) * TILE + 15 });
    return {
      projectId,
      tx,
      ty,
      row,
      seat: { x: (tx + 1) * TILE, y: (ty + 1) * TILE + 13 },
      approach: { tx, ty: ty + 2 },
    };
  });
  // Huecos vacíos de la cuadrícula: plantas o impresora para que no quede cojo.
  for (let i = n; i < k * 2; i++) {
    const col = Math.floor(i / 2);
    const row = i % 2 === 0 ? ROW_A : ROW_B;
    const tx = openX0 + 1 + col * 3;
    add(i % 4 === 1 ? 'printer' : 'bigPlant', tx + (i % 2), row, 1);
  }
  add('plant', openX0, rows - 2);
  add('plant', cafeX0 - 1, rows - 2);

  // Café
  const c = cafeX0;
  add('counter', c + 1, 3, 3);
  add('cooler', c + 4, 3);
  add('fridge', c + 5, 3);
  add('vending', c + 6, 3);
  add('sofa', c + 2, 8, 3, { sortY: 8 * TILE + 6 });
  add('coffeeTable', c + 2, 10, 3);
  add('beanbag', c + 6, 10, 1, { sortY: 10 * TILE + 6 });
  add('plant', c + 1, rows - 2);
  add('bigPlant', c + 6, 7);

  const sofaSeat = (i: number): Spot => ({
    id: `sofa${i}`,
    approach: { tx: c + 2 + i, ty: 9 },
    seat: { x: (c + 2 + i) * TILE + 8, y: 8 * TILE + 13 },
    face: 'down',
    pose: 'sit-front',
  });
  const coffeeSpot: Spot = { id: 'cafetera', approach: { tx: c + 2, ty: 4 }, face: 'up', pose: 'stand' };
  const cafeSpots: Spot[] = [
    sofaSeat(0),
    sofaSeat(1),
    sofaSeat(2),
    {
      id: 'puf',
      approach: { tx: c + 6, ty: 11 },
      seat: { x: (c + 6) * TILE + 8, y: 10 * TILE + 13 },
      face: 'down',
      pose: 'sit-front',
    },
    { id: 'fuente', approach: { tx: c + 4, ty: 4 }, face: 'up', pose: 'stand' },
    { id: 'charla1', approach: { tx: c + 4, ty: 6 }, face: 'right', pose: 'stand' },
    { id: 'charla2', approach: { tx: c + 5, ty: 6 }, face: 'left', pose: 'stand' },
    { id: 'sofa-lado', approach: { tx: c + 1, ty: 9 }, face: 'right', pose: 'stand' },
  ];

  // Pared: ventanas, pizarra, reloj…
  const wall: WallItem[] = [
    { kind: 'window', x: 2 * TILE + 2, w: 2 * TILE - 4 },
    { kind: 'diploma', x: 4 * TILE + 3, w: 10 },
    { kind: 'clock', x: 5 * TILE + 3, w: 10 },
  ];
  const boardW = 4 * TILE;
  const boardX = (openX0 + Math.floor((openW - 4) / 2)) * TILE;
  wall.push({ kind: 'whiteboard', x: boardX, w: boardW });
  const sides: Array<[number, number]> = [
    [openX0 * TILE, boardX],
    [boardX + boardW, cafeX0 * TILE],
  ];
  for (const [from, to] of sides) {
    const space = to - from;
    const count = Math.max(1, Math.floor(space / (3 * TILE)));
    const slot = space / count;
    for (let i = 0; i < count; i++) {
      const w = 2 * TILE - 2;
      wall.push({ kind: 'window', x: Math.round(from + slot * i + (slot - w) / 2), w });
    }
  }
  wall.push({ kind: 'menu', x: (c + 1) * TILE + 6, w: 2 * TILE - 4 });
  wall.push({ kind: 'window', x: (c + 3) * TILE + 2, w: 2 * TILE - 4 });

  const lights: LightDef[] = [
    { x: 0.5 * TILE, y: 5 * TILE - 6, r: 46, color: '#ffcf7a', strength: 0.9 },
    { x: 3.5 * TILE, y: 6 * TILE + 4, r: 30, color: '#ffd98a', strength: 0.7 },
    { x: (c + 2.5) * TILE, y: 4 * TILE, r: 44, color: '#ffc48a', strength: 0.85 },
    { x: (c + 3.5) * TILE, y: 9 * TILE + 4, r: 48, color: '#ffb36b', strength: 0.75 },
    { x: (c + 6.5) * TILE, y: 4 * TILE, r: 26, color: '#ff6b5e', strength: 0.6 },
  ];
  for (let x = openX0 + 2; x < cafeX0 - 1; x += 3) {
    lights.push({ x: x * TILE, y: 7 * TILE, r: 40, color: '#cfd8ff', strength: 0.45 });
  }
  for (const w of wall.filter((item) => item.kind === 'window')) {
    lights.push({ x: w.x + w.w / 2, y: WALL_ROWS * TILE + 6, r: 22, color: '#9ab8ff', strength: 0.35 });
  }

  return {
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    openX0,
    openW,
    cafeX0,
    blocked,
    desks,
    props,
    wall,
    lights,
    ceoSeat: { x: 3 * TILE + 8, y: 5 * TILE + 13 },
    ceoApproach: { tx: 4, ty: 5 },
    cafeSpots,
    coffeeSpot,
  };
}

export function isBlocked(layout: Layout, t: Tile): boolean {
  if (t.tx < 0 || t.ty < 0 || t.tx >= layout.cols || t.ty >= layout.rows) return true;
  return layout.blocked[t.ty * layout.cols + t.tx];
}

export function tileCenter(t: Tile): Point {
  return { x: t.tx * TILE + 8, y: t.ty * TILE + 12 };
}

export function tileAt(p: Point): Tile {
  return { tx: Math.floor(p.x / TILE), ty: Math.floor((p.y - 4) / TILE) };
}

/** Camino más corto (BFS en 4 direcciones). Devuelve las casillas sin incluir la de salida. */
export function findPath(layout: Layout, from: Tile, to: Tile): Tile[] {
  const { cols, rows } = layout;
  const start = from.ty * cols + from.tx;
  const goal = to.ty * cols + to.tx;
  if (start === goal) return [];
  const prev = new Int32Array(cols * rows).fill(-1);
  prev[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const cx = cur % cols;
    const cy = Math.floor(cur / cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (prev[ni] !== -1) continue;
      if (layout.blocked[ni] && ni !== goal) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -1) return [];
  const path: Tile[] = [];
  for (let cur = goal; cur !== start; cur = prev[cur]) path.push({ tx: cur % cols, ty: Math.floor(cur / cols) });
  return path.reverse();
}

/** Casilla libre más cercana (por si alguien se queda encima de un mueble al cambiar el plano). */
export function nearestFree(layout: Layout, t: Tile): Tile {
  if (!isBlocked(layout, t)) return t;
  for (let r = 1; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const c = { tx: t.tx + dx, ty: t.ty + dy };
        if (!isBlocked(layout, c)) return c;
      }
    }
  }
  return { tx: layout.openX0, ty: 6 };
}
