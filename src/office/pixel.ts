// Utilidades de dibujo pixel a pixel y paleta común de la oficina.

export { TILE } from '../../shared/layout.ts';

export const C = {
  void: '#0d1021',
  out: '#1a1426',
  wallCap: '#191932',
  wallTop: '#3d4272',
  wall: '#343864',
  wainscot: '#4a3a5e',
  wainscotTrim: '#5e4a78',
  baseboard: '#211a33',
  wood1: '#7a5644',
  wood2: '#6f4d3d',
  woodSeam: '#573b2f',
  woodDark1: '#5e3f31',
  woodDark2: '#553829',
  tileA: '#cdbd9e',
  tileB: '#b3a283',
  rug: '#8e2b3d',
  rugIn: '#a3354a',
  rugGold: '#e0b04a',
  glass: 'rgba(150,200,255,0.18)',
  glassEdge: '#7f8bbd',
  frame: '#5a5f86',
  deskTop: '#b8834f',
  deskEdge: '#d09a62',
  deskFront: '#8a5a3a',
  deskLeg: '#4f3226',
  bezel: '#262838',
  screenOff: '#16202e',
  chairSeat: '#3c4a6e',
  chairBack: '#2f3a58',
  chairBase: '#1c2030',
  white: '#f4f4f8',
  paper: '#eef3f8',
  leaf1: '#2f7a45',
  leaf2: '#4caf5f',
  leaf3: '#7ad37f',
  pot: '#b5653a',
  potDark: '#8a4a2a',
};

export type Px = (x: number, y: number, w: number, h: number, color: string) => void;

export function pxOf(ctx: CanvasRenderingContext2D, ox = 0, oy = 0): Px {
  return (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(ox + x), Math.round(oy + y), w, h);
  };
}

function clamp(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Aclara (amount > 0) u oscurece (amount < 0) un color hexadecimal. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  const f = (c: number) => (amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `#${[f(r), f(g), f(b)].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Generador pseudoaleatorio con semilla, para que la decoración no cambie entre fotogramas. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/** Texto en negro o blanco según el color de fondo. */
export function inkFor(hex: string): string {
  const [r, g, b] = parse(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#141024' : '#ffffff';
}
