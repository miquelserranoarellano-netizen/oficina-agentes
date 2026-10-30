import type { Dir, Look, Pose } from '../../shared/types.ts';
import { C, pxOf, shade, type Px } from './pixel';

// Personajes dibujados en código: celda de 16x24 con los pies en (8, 23).
// Vistas: de frente, de espaldas y de lado (la izquierda es la derecha en espejo).

export const SPRITE_W = 16;
export const SPRITE_H = 24;

const OUT = C.out;
const EYE = '#1d1630';
const BLUSH = '#f2958a';
const WHITE = '#f4f4f8';
const BOB = [0, -1, 0, -1];

interface Pal {
  L: Look;
  skinShade: string;
  hairLight: string;
  hairDark: string;
  shirtShade: string;
  pantsShade: string;
  mouth: string;
}

function palette(L: Look): Pal {
  return {
    L,
    skinShade: shade(L.skin, -0.18),
    hairLight: shade(L.hair, 0.28),
    hairDark: shade(L.hair, -0.3),
    shirtShade: shade(L.shirt, -0.22),
    pantsShade: shade(L.pants, -0.3),
    mouth: shade(L.skin, -0.4),
  };
}

/* ---------- piernas ---------- */

function legsFront(p: Px, P: Pal, liftL: number, liftR: number) {
  for (const [x, lift] of [
    [4, liftL],
    [8, liftR],
  ]) {
    const bottom = 23 - lift;
    p(x, 18, 4, bottom - 17, OUT);
    p(x + 1, 18, 2, bottom - 19, P.L.pants);
    p(x + 1, bottom - 1, 2, 1, P.L.shoes);
  }
}

function legsSide(p: Px, P: Pal, frame: number) {
  if (frame % 2 === 0) {
    p(6, 18, 4, 6, OUT);
    p(7, 18, 2, 4, P.L.pants);
    p(7, 22, 3, 1, P.L.shoes);
    return;
  }
  const swap = frame === 3;
  const back = swap ? 8 : 4;
  const front = swap ? 4 : 8;
  p(back, 18, 4, 5, OUT);
  p(back + 1, 18, 2, 3, P.pantsShade);
  p(back + 1, 21, 2, 1, shade(P.L.shoes, -0.3));
  p(front, 18, 4, 6, OUT);
  p(front + 1, 18, 2, 4, P.L.pants);
  p(front + 1, 22, 3, 1, P.L.shoes);
}

function legsSitting(p: Px, P: Pal) {
  p(4, 20, 8, 4, OUT);
  p(5, 20, 2, 2, P.L.pants);
  p(9, 20, 2, 2, P.L.pants);
  p(5, 22, 2, 1, P.L.shoes);
  p(9, 22, 2, 1, P.L.shoes);
}

/* ---------- torso ---------- */

function torsoFront(p: Px, P: Pal, b: number, swing: number) {
  const { L } = P;
  p(3, 12 + b, 10, 7, OUT);
  p(4, 13 + b, 8, 5, L.shirt);
  p(5, 17 + b, 6, 1, L.pants);
  p(4, 13 + b, 1, 4, P.shirtShade);
  p(11, 13 + b, 1, 4, P.shirtShade);
  p(4, 17 + b - (swing > 0 ? 1 : 0), 1, 1, L.skin);
  p(11, 17 + b - (swing < 0 ? 1 : 0), 1, 1, L.skin);
  if (L.trait === 'corbata') {
    p(6, 13 + b, 4, 1, WHITE);
    p(6, 14 + b, 1, 1, WHITE);
    p(9, 14 + b, 1, 1, WHITE);
    p(7, 13 + b, 2, 1, shade(L.accent, -0.3));
    p(7, 14 + b, 2, 3, L.accent);
  } else if (L.trait === 'bata') {
    p(7, 13 + b, 2, 3, L.accent);
    p(6, 13 + b, 1, 1, P.shirtShade);
    p(9, 13 + b, 1, 1, P.shirtShade);
    p(5, 17 + b, 6, 1, L.shirt);
  } else {
    p(6, 13 + b, 4, 1, shade(L.shirt, 0.18));
  }
}

function coatSkirt(p: Px, P: Pal, b: number) {
  if (P.L.trait !== 'bata') return;
  p(3, 18 + b, 10, 3, OUT);
  p(4, 18 + b, 8, 2, P.L.shirt);
  p(7, 18 + b, 2, 2, P.shirtShade);
}

function torsoBack(p: Px, P: Pal, b: number, swing: number) {
  const { L } = P;
  p(3, 12 + b, 10, 7, OUT);
  p(4, 13 + b, 8, 5, L.shirt);
  p(5, 17 + b, 6, 1, L.trait === 'bata' ? L.shirt : L.pants);
  p(4, 13 + b, 1, 4, P.shirtShade);
  p(11, 13 + b, 1, 4, P.shirtShade);
  p(7, 14 + b, 2, 3, P.shirtShade);
  p(4, 17 + b - (swing > 0 ? 1 : 0), 1, 1, L.skin);
  p(11, 17 + b - (swing < 0 ? 1 : 0), 1, 1, L.skin);
}

function torsoSide(p: Px, P: Pal, b: number, armDx: number) {
  const { L } = P;
  p(4, 12 + b, 8, 7, OUT);
  p(5, 13 + b, 6, 5, L.shirt);
  p(5, 17 + b, 6, 1, L.trait === 'bata' ? L.shirt : L.pants);
  if (L.trait === 'corbata') {
    p(9, 13 + b, 2, 1, WHITE);
    p(10, 14 + b, 1, 3, L.accent);
  }
  if (L.trait === 'bata') p(10, 13 + b, 1, 3, L.accent);
  p(7 + armDx, 13 + b, 2, 4, P.shirtShade);
  p(7 + armDx, 17 + b, 2, 1, L.skin);
}

/* ---------- cabeza ---------- */

function headShape(p: Px, b: number) {
  p(4, 2 + b, 8, 11, OUT);
  p(3, 3 + b, 10, 9, OUT);
}

function headFront(p: Px, P: Pal, b: number) {
  const { L } = P;
  headShape(p, b);
  p(4, 3 + b, 8, 9, L.skin);
  p(5, 11 + b, 6, 1, P.skinShade);
  // pelo
  switch (L.hairStyle) {
    case 'peinado':
      p(4, 3 + b, 8, 3, L.hair);
      p(4, 6 + b, 1, 2, L.hair);
      p(11, 6 + b, 1, 2, L.hair);
      p(5, 3 + b, 4, 1, P.hairLight);
      p(9, 5 + b, 2, 1, P.hairDark);
      break;
    case 'pincho':
      p(4, 1 + b, 2, 2, OUT);
      p(7, 0 + b, 2, 3, OUT);
      p(10, 1 + b, 2, 2, OUT);
      p(4, 3 + b, 8, 3, L.hair);
      p(5, 2 + b, 1, 1, L.hair);
      p(8, 1 + b, 1, 2, L.hair);
      p(10, 2 + b, 1, 1, L.hair);
      p(4, 6 + b, 1, 1, L.hair);
      p(11, 6 + b, 1, 1, L.hair);
      p(6, 5 + b, 1, 1, L.hair);
      p(9, 5 + b, 1, 1, L.hair);
      break;
    case 'melena':
      p(2, 5 + b, 1, 7, OUT);
      p(13, 5 + b, 1, 7, OUT);
      p(3, 12 + b, 2, 1, OUT);
      p(11, 12 + b, 2, 1, OUT);
      p(4, 3 + b, 8, 3, L.hair);
      p(3, 4 + b, 1, 8, L.hair);
      p(12, 4 + b, 1, 8, L.hair);
      p(4, 6 + b, 1, 6, L.hair);
      p(11, 6 + b, 1, 6, L.hair);
      p(6, 3 + b, 3, 1, P.hairLight);
      break;
    case 'rizos':
      p(4, 1 + b, 3, 1, OUT);
      p(8, 1 + b, 3, 1, OUT);
      p(4, 2 + b, 8, 4, L.hair);
      p(3, 3 + b, 1, 4, L.hair);
      p(12, 3 + b, 1, 4, L.hair);
      p(5, 3 + b, 1, 1, P.hairDark);
      p(8, 2 + b, 1, 1, P.hairDark);
      p(10, 4 + b, 1, 1, P.hairDark);
      p(6, 5 + b, 1, 1, P.hairDark);
      p(4, 6 + b, 1, 1, L.hair);
      p(11, 6 + b, 1, 1, L.hair);
      break;
    case 'coleta':
      p(13, 4 + b, 2, 6, OUT);
      p(13, 5 + b, 1, 4, L.hair);
      p(4, 3 + b, 8, 3, L.hair);
      p(4, 6 + b, 1, 3, L.hair);
      p(11, 6 + b, 1, 3, L.hair);
      p(5, 3 + b, 3, 1, P.hairLight);
      p(12, 5 + b, 1, 1, L.accent);
      break;
    case 'canoso':
      p(4, 3 + b, 2, 2, L.hair);
      p(10, 3 + b, 2, 2, L.hair);
      p(6, 3 + b, 4, 1, L.hair);
      p(4, 5 + b, 1, 3, L.hair);
      p(11, 5 + b, 1, 3, L.hair);
      break;
  }
  // cara
  if (L.trait === 'gafas') {
    p(5, 6 + b, 3, 3, L.accent);
    p(8, 6 + b, 3, 3, L.accent);
    p(6, 7 + b, 1, 1, EYE);
    p(9, 7 + b, 1, 1, EYE);
    p(5, 6 + b, 1, 1, '#9fd3ff');
    p(8, 6 + b, 1, 1, '#9fd3ff');
  } else {
    p(6, 7 + b, 1, 2, EYE);
    p(9, 7 + b, 1, 2, EYE);
  }
  p(5, 9 + b, 1, 1, BLUSH);
  p(10, 9 + b, 1, 1, BLUSH);
  p(7, 10 + b, 2, 1, P.mouth);
  if (L.hairStyle === 'canoso') {
    p(4, 9 + b, 8, 3, L.hair);
    p(5, 12 + b, 6, 1, L.hair);
    p(7, 10 + b, 2, 1, P.mouth);
    p(5, 9 + b, 1, 1, P.hairLight);
  }
}

function headBack(p: Px, P: Pal, b: number) {
  const { L } = P;
  headShape(p, b);
  p(4, 3 + b, 8, 9, L.hair);
  if (L.hairStyle === 'melena') {
    p(2, 5 + b, 1, 7, OUT);
    p(13, 5 + b, 1, 7, OUT);
    p(3, 4 + b, 1, 8, L.hair);
    p(12, 4 + b, 1, 8, L.hair);
    p(3, 12 + b, 10, 1, OUT);
    p(4, 11 + b, 8, 1, L.hair);
  } else if (L.hairStyle === 'canoso' || L.hairStyle === 'peinado') {
    p(5, 10 + b, 6, 2, L.skin);
  } else {
    p(5, 11 + b, 6, 1, L.skin);
  }
  if (L.hairStyle === 'pincho') {
    p(4, 1 + b, 2, 2, OUT);
    p(7, 0 + b, 2, 3, OUT);
    p(10, 1 + b, 2, 2, OUT);
    p(5, 2 + b, 1, 1, L.hair);
    p(8, 1 + b, 1, 2, L.hair);
    p(10, 2 + b, 1, 1, L.hair);
  }
  if (L.hairStyle === 'rizos') {
    p(4, 1 + b, 3, 1, OUT);
    p(8, 1 + b, 3, 1, OUT);
    p(4, 2 + b, 8, 1, L.hair);
    p(6, 4 + b, 1, 1, P.hairDark);
    p(9, 6 + b, 1, 1, P.hairDark);
    p(5, 8 + b, 1, 1, P.hairDark);
  }
  p(5, 4 + b, 3, 1, P.hairLight);
  if (L.trait === 'gafas') {
    p(3, 7 + b, 1, 1, L.accent);
    p(12, 7 + b, 1, 1, L.accent);
  }
}

function ponytailBack(p: Px, P: Pal, b: number) {
  if (P.L.hairStyle !== 'coleta') return;
  p(6, 8 + b, 4, 8, OUT);
  p(7, 9 + b, 2, 6, P.L.hair);
  p(7, 9 + b, 2, 1, P.L.accent);
  p(7, 10 + b, 1, 3, P.hairLight);
}

function headSide(p: Px, P: Pal, b: number, frame: number) {
  const { L } = P;
  if (L.hairStyle === 'coleta') {
    const sw = frame % 2;
    p(0, 4 + b + sw, 4, 7, OUT);
    p(1, 5 + b + sw, 2, 5, L.hair);
    p(3, 5 + b, 1, 2, L.accent);
  }
  if (L.hairStyle === 'melena') {
    p(2, 4 + b, 2, 9, OUT);
  }
  headShape(p, b);
  p(4, 3 + b, 8, 9, L.skin);
  p(4, 3 + b, 8, 3, L.hair);
  p(4, 6 + b, 4, 4, L.hair);
  p(4, 10 + b, 2, 1, L.hair);
  switch (L.hairStyle) {
    case 'melena':
      p(3, 4 + b, 1, 8, L.hair);
      p(4, 6 + b, 4, 6, L.hair);
      break;
    case 'pincho':
      p(4, 1 + b, 2, 2, OUT);
      p(7, 0 + b, 2, 3, OUT);
      p(10, 1 + b, 2, 2, OUT);
      p(5, 2 + b, 1, 1, L.hair);
      p(8, 1 + b, 1, 2, L.hair);
      p(10, 2 + b, 1, 1, L.hair);
      break;
    case 'rizos':
      p(4, 1 + b, 3, 1, OUT);
      p(8, 1 + b, 3, 1, OUT);
      p(4, 2 + b, 8, 1, L.hair);
      p(5, 4 + b, 1, 1, P.hairDark);
      p(9, 3 + b, 1, 1, P.hairDark);
      break;
    case 'canoso':
      p(8, 3 + b, 4, 1, L.skin);
      break;
  }
  p(9, 3 + b, 3, 1, P.hairLight);
  p(7, 7 + b, 1, 2, P.skinShade);
  if (L.trait === 'gafas') {
    p(9, 6 + b, 3, 3, L.accent);
    p(10, 7 + b, 1, 1, EYE);
    p(9, 6 + b, 1, 1, '#9fd3ff');
    p(7, 7 + b, 2, 1, L.accent);
  } else {
    p(10, 7 + b, 1, 2, EYE);
  }
  p(10, 9 + b, 1, 1, BLUSH);
  p(11, 10 + b, 1, 1, P.mouth);
  if (L.hairStyle === 'canoso') {
    p(8, 9 + b, 4, 3, L.hair);
    p(11, 10 + b, 1, 1, P.mouth);
  }
}

/* ---------- complementos de cabeza ---------- */

function hatAndPhones(p: Px, P: Pal, b: number, view: 'front' | 'back' | 'side') {
  const { L } = P;
  if (L.trait === 'boina') {
    p(2, 1 + b, 12, 3, OUT);
    p(3, 0 + b, 9, 1, OUT);
    p(3, 2 + b, 10, 1, L.accent);
    p(4, 1 + b, 7, 1, L.accent);
    p(5, 1 + b, 3, 1, shade(L.accent, 0.3));
    p(view === 'side' ? 3 : 13, 3 + b, 1, 1, OUT);
    p(7, -1 + b + 1, 1, 1, OUT);
  }
  if (L.trait === 'cascos') {
    const band = '#4a4f6a';
    if (view === 'side') {
      p(5, 1 + b, 5, 1, OUT);
      p(5, 2 + b, 1, 4, OUT);
      p(6, 1 + b, 3, 1, band);
      p(4, 6 + b, 5, 5, OUT);
      p(5, 7 + b, 3, 3, L.accent);
      p(5, 7 + b, 1, 1, shade(L.accent, 0.35));
    } else {
      p(3, 1 + b, 10, 1, OUT);
      p(4, 1 + b, 8, 1, band);
      p(2, 2 + b, 1, 4, OUT);
      p(13, 2 + b, 1, 4, OUT);
      p(1, 6 + b, 3, 5, OUT);
      p(12, 6 + b, 3, 5, OUT);
      p(2, 7 + b, 1, 3, L.accent);
      p(13, 7 + b, 1, 3, L.accent);
    }
  }
}

/* ---------- composición ---------- */

function drawSprite(p: Px, L: Look, pose: Pose, dir: Dir, frame: number) {
  const P = palette(L);
  if (pose === 'type') {
    // Sentado de espaldas tecleando: la silla tapa las piernas.
    const b = 2;
    torsoBack(p, P, b, 0);
    if (frame % 2 === 0) p(3, 15 + b, 1, 2, P.shirtShade);
    else p(12, 15 + b, 1, 2, P.shirtShade);
    headBack(p, P, b + (frame % 2));
    hatAndPhones(p, P, b + (frame % 2), 'back');
    ponytailBack(p, P, b + (frame % 2));
    return;
  }
  if (pose === 'sit-front') {
    const b = 2;
    legsSitting(p, P);
    torsoFront(p, P, b, 0);
    headFront(p, P, b);
    hatAndPhones(p, P, b, 'front');
    return;
  }
  const b = BOB[frame % 4];
  const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  if (dir === 'down') {
    legsFront(p, P, frame === 1 ? 1 : 0, frame === 3 ? 1 : 0);
    torsoFront(p, P, b, swing);
    coatSkirt(p, P, b);
    headFront(p, P, b);
    hatAndPhones(p, P, b, 'front');
  } else if (dir === 'up') {
    legsFront(p, P, frame === 3 ? 1 : 0, frame === 1 ? 1 : 0);
    torsoBack(p, P, b, swing);
    coatSkirt(p, P, b);
    headBack(p, P, b);
    hatAndPhones(p, P, b, 'back');
    ponytailBack(p, P, b);
  } else {
    legsSide(p, P, frame);
    torsoSide(p, P, b, swing);
    if (L.trait === 'bata') {
      p(4, 18 + b, 8, 3, OUT);
      p(5, 18 + b, 6, 2, L.shirt);
    }
    headSide(p, P, b, frame);
    hatAndPhones(p, P, b, 'side');
  }
}

const cache = new Map<string, HTMLCanvasElement>();

export function getSprite(agentId: string, look: Look, pose: Pose, dir: Dir, frame: number): HTMLCanvasElement {
  const facing: Dir = pose === 'type' ? 'up' : pose === 'sit-front' ? 'down' : dir;
  const f = pose === 'stand' ? frame % 4 : pose === 'type' ? frame % 2 : 0;
  const key = `${agentId}|${pose}|${facing}|${f}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W;
  canvas.height = SPRITE_H;
  const ctx = canvas.getContext('2d')!;
  if (facing === 'left') {
    ctx.translate(SPRITE_W, 0);
    ctx.scale(-1, 1);
  }
  drawSprite(pxOf(ctx), look, pose, facing === 'left' ? 'right' : facing, f);
  cache.set(key, canvas);
  return canvas;
}

/** Retrato de frente para el panel lateral (data URL). */
export function portrait(agentId: string, look: Look): string {
  const src = getSprite(agentId, look, 'stand', 'down', 0);
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W;
  canvas.height = 16;
  canvas.getContext('2d')!.drawImage(src, 0, 0, SPRITE_W, 16, 0, 0, SPRITE_W, 16);
  return canvas.toDataURL();
}
