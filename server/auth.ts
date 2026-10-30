import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.ts';
import type { Store, UserRow } from './db.ts';

// Contraseñas (bcrypt), sesiones con token aleatorio, límite de intentos y pasos pendientes de 2FA.

export const COOKIE_NAME = 'oficina_sesion';
const BCRYPT_COST = 12;
// Hash de relleno: si el usuario no existe se compara igual, para no delatarlo por el tiempo de respuesta.
const DUMMY_HASH = bcrypt.hashSync('relleno-para-igualar-tiempos', BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function checkPassword(user: UserRow | undefined, password: string): Promise<boolean> {
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  return ok && !!user;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function startSession(store: Store, user: UserRow, ip: string, userAgent: string) {
  const token = newToken();
  const maxAge = config.sessionDays * 24 * 3600;
  store.createSession(hashToken(token), user.id, Date.now() + maxAge * 1000, ip, userAgent);
  return { token, maxAge };
}

export const cookieOptions = () => ({
  path: '/',
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'strict' as const,
});

/** Segundos que faltan para poder volver a intentarlo, o 0 si no está bloqueado. */
export function lockedFor(store: Store, ip: string): number {
  const windowMs = config.loginWindowMin * 60_000;
  const failures = store.recentFailures(ip, Date.now() - windowMs, config.loginMaxFailures);
  if (failures.length < config.loginMaxFailures) return 0;
  const unlockAt = failures[config.loginMaxFailures - 1] + windowMs;
  return Math.max(1, Math.ceil((unlockAt - Date.now()) / 1000));
}

/* ---------- segundo paso (2FA) ---------- */

interface Pending {
  userId: number;
  ip: string;
  expires: number;
}

const pending = new Map<string, Pending>();

export function createTicket(userId: number, ip: string): string {
  const ticket = newToken();
  pending.set(ticket, { userId, ip, expires: Date.now() + 5 * 60_000 });
  return ticket;
}

export function readTicket(ticket: string, ip: string): Pending | undefined {
  const p = pending.get(ticket);
  if (!p || p.expires < Date.now() || p.ip !== ip) return undefined;
  return p;
}

export function dropTicket(ticket: string) {
  pending.delete(ticket);
}

export function sweepTickets() {
  const now = Date.now();
  for (const [k, p] of pending) if (p.expires < now) pending.delete(k);
}
